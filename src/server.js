require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser');

const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------- 基础订单 API ----------

app.post('/api/orders', (req, res) => {
  const { amount, currency = 'cny', description = '' } = req.body || {};

  if (!amount || !Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ error: 'amount 必须是大于 0 的整数（以最小货币单位，比如分）' });
  }

  const stmt = db.prepare(
    'INSERT INTO orders (amount, currency, description, status) VALUES (?, ?, ?, ?)'
  );
  stmt.run(amount, currency, description, 'pending', function (err) {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: '创建订单失败' });
    }
    res.json({
      id: this.lastID,
      amount,
      currency,
      description,
      status: 'pending'
    });
  });
});

app.get('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM orders WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: '查询订单失败' });
    }
    if (!row) {
      return res.status(404).json({ error: '订单不存在' });
    }
    res.json(row);
  });
});

// ---------- 万里汇 WorldFirst 支付 ----------

const worldfirst = require('./worldfirst');

function getWorldFirstConfig() {
  const clientId = process.env.WORLDFIRST_CLIENT_ID;
  const privateKeyPem = process.env.WORLDFIRST_PRIVATE_KEY || (process.env.WORLDFIRST_PRIVATE_KEY_PATH && require('fs').readFileSync(process.env.WORLDFIRST_PRIVATE_KEY_PATH, 'utf8'));
  const domain = process.env.WORLDFIRST_DOMAIN || 'na';
  const baseUrl = (process.env.BASE_URL || '').replace(/\/$/, '') || `http://localhost:${PORT}`;
  return { clientId, privateKeyPem, domain, baseUrl };
}

app.post('/api/payments/worldfirst/create', (req, res) => {
  const { orderId } = req.body || {};
  if (!orderId) {
    return res.status(400).json({ error: '缺少 orderId' });
  }

  const config = getWorldFirstConfig();
  if (!config.clientId || !config.privateKeyPem) {
    return res.status(500).json({ error: '未配置万里汇（WORLDFIRST_CLIENT_ID / WORLDFIRST_PRIVATE_KEY）' });
  }

  db.get('SELECT * FROM orders WHERE id = ?', [orderId], (err, order) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: '查询订单失败' });
    }
    if (!order) {
      return res.status(404).json({ error: '订单不存在' });
    }
    if (order.status === 'paid') {
      return res.status(400).json({ error: '订单已支付' });
    }

    const paymentRedirectUrl = `${config.baseUrl}/result.html?orderId=${order.id}&provider=worldfirst`;
    const paymentNotifyUrl = `${config.baseUrl}/webhook/worldfirst/notify`;

    worldfirst.createCashierPayment({
      clientId: config.clientId,
      privateKeyPem: config.privateKeyPem,
      domain: config.domain,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      description: order.description || `订单#${order.id}`,
      paymentRedirectUrl,
      paymentNotifyUrl
    }).then((out) => {
      if (out.error && !out.redirectUrl) {
        return res.status(500).json({ error: out.error, result: out.result });
      }
      if (!out.redirectUrl) {
        return res.status(500).json({ error: out.error || '未返回支付链接' });
      }

      db.run(
        'INSERT INTO payments (order_id, provider, provider_payment_id, pay_to_request_id, status, raw_response) VALUES (?, ?, ?, ?, ?, ?)',
        [order.id, 'worldfirst', out.payToSummaries && out.payToSummaries[0] && out.payToSummaries[0].payToId, out.payToRequestId, 'pending', JSON.stringify(out)],
        (insertErr) => {
          if (insertErr) console.error(insertErr);
        }
      );

      res.json({ redirectUrl: out.redirectUrl, orderId: order.id, payToRequestId: out.payToRequestId });
    }).catch((e) => {
      console.error(e);
      res.status(500).json({ error: e.message || '创建万里汇支付失败' });
    });
  });
});

app.post('/api/payments/worldfirst/inquire', (req, res) => {
  const { payToRequestId } = req.body || {};
  if (!payToRequestId) {
    return res.status(400).json({ error: '缺少 payToRequestId' });
  }

  const config = getWorldFirstConfig();
  if (!config.clientId || !config.privateKeyPem) {
    return res.status(500).json({ error: '未配置万里汇' });
  }

  worldfirst.inquirePayment({
    clientId: config.clientId,
    privateKeyPem: config.privateKeyPem,
    domain: config.domain,
    payToRequestIds: [payToRequestId]
  }).then((body) => {
    res.json(body);
  }).catch((e) => {
    console.error(e);
    res.status(500).json({ error: e.message || '查询失败' });
  });
});

// 万里汇支付结果异步通知（需 raw body 以便验签，此处用 json 解析后回复加签）
app.post('/webhook/worldfirst/notify', (req, res) => {
  let payload = req.body;
  const rawBody = req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)
    ? JSON.stringify(req.body)
    : (req.body && Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '');
  if (Buffer.isBuffer(req.body) || typeof req.body === 'string') {
    try {
      payload = JSON.parse(rawBody || '{}');
    } catch (e) {
      return res.status(400).send('Invalid JSON');
    }
  }

  const payToRequestId = payload.payToRequestId;
  const notifyType = payload.notifyType;

  if (!payToRequestId) {
    return res.status(400).json({ result: { resultStatus: 'F', resultCode: 'PARAM_ILLEGAL', resultMessage: 'Missing payToRequestId' } });
  }

  if (notifyType === 'PAYMENT_RESULT' && payload.result && payload.result.resultStatus === 'S') {
    db.get('SELECT * FROM payments WHERE pay_to_request_id = ?', [payToRequestId], (err, payment) => {
      if (!err && payment) {
        db.run('UPDATE payments SET status = ? WHERE id = ?', ['succeeded', payment.id]);
        db.run('UPDATE orders SET status = ? WHERE id = ?', ['paid', payment.order_id]);
      }
    });
  }

  const responseBody = { result: { resultStatus: 'S', resultCode: 'SUCCESS', resultMessage: 'success.' } };
  const responseBodyString = JSON.stringify(responseBody);
  const responseTime = new Date().toISOString().replace(/\.\d{3}/, '');
  const config = getWorldFirstConfig();

  if (config.clientId && config.privateKeyPem) {
    const signature = worldfirst.signNotifyResponse(
      config.clientId,
      responseTime,
      responseBodyString,
      config.privateKeyPem
    );
    res.setHeader('Signature', signature);
  }
  res.setHeader('Content-Type', 'application/json; charset=UTF-8');
  res.setHeader('Client-Id', config.clientId || '');
  res.setHeader('Response-Time', responseTime);
  res.status(200).send(responseBodyString);
});

// ---------- Stripe 支付（示例：支持万事达卡） ----------

let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
}

app.post('/api/payments/create-intent', async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ error: '尚未配置 Stripe 密钥（STRIPE_SECRET_KEY）' });
    }

    const { orderId } = req.body || {};
    if (!orderId) {
      return res.status(400).json({ error: '缺少 orderId' });
    }

    db.get('SELECT * FROM orders WHERE id = ?', [orderId], async (err, order) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: '查询订单失败' });
      }
      if (!order) {
        return res.status(404).json({ error: '订单不存在' });
      }
      if (order.status === 'paid') {
        return res.status(400).json({ error: '订单已支付' });
      }

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: order.amount,
          currency: order.currency,
          description: order.description || `订单#${order.id}`,
          payment_method_types: ['card']
        });

        const stmt = db.prepare(
          'INSERT INTO payments (order_id, provider, provider_payment_id, status, raw_response) VALUES (?, ?, ?, ?, ?)'
        );
        stmt.run(
          order.id,
          'stripe',
          paymentIntent.id,
          paymentIntent.status,
          JSON.stringify(paymentIntent),
          function (insertErr) {
            if (insertErr) {
              console.error(insertErr);
              // 不阻塞前端支付
            }
          }
        );

        res.json({
          clientSecret: paymentIntent.client_secret,
          orderId: order.id
        });
      } catch (stripeErr) {
        console.error(stripeErr);
        res.status(500).json({ error: '创建支付意图失败', detail: stripeErr.message });
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 简单的支付结果轮询接口
app.get('/api/orders/:id/status', (req, res) => {
  const { id } = req.params;
  db.get('SELECT status FROM orders WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: '查询订单状态失败' });
    }
    if (!row) {
      return res.status(404).json({ error: '订单不存在' });
    }
    res.json({ status: row.status });
  });
});

// Stripe webhook（可选，用于自动更新订单状态）
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    if (webhookSecret && stripe) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      event = req.body;
    }
  } catch (err) {
    console.error(`Webhook 验证失败: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    const paymentIntentId = pi.id;

    db.get(
      'SELECT * FROM payments WHERE provider = ? AND provider_payment_id = ?',
      ['stripe', paymentIntentId],
      (err, payment) => {
        if (!err && payment) {
          db.run('UPDATE payments SET status = ? WHERE id = ?', ['succeeded', payment.id]);
          db.run('UPDATE orders SET status = ? WHERE id = ?', ['paid', payment.order_id]);
        }
      }
    );
  }

  res.json({ received: true });
});

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
});

