/**
 * 万里汇 WorldFirst 支付 API 客户端
 * 文档: https://developers.worldfirst.com/docs/alipay-worldfirst/cashier_payment_zh/
 */
const crypto = require('crypto');
const https = require('https');

const DOMAINS = {
  na: 'open-na.worldfirst.com',
  eu: 'open-eu.worldfirst.com',
  sea: 'open-sea.worldfirst.com'
};

const ENDPOINTS = {
  create: '/amsin/api/v1/business/create',
  inquiryPayOrder: '/amsin/api/v1/business/inquiryPayOrder'
};

/**
 * 生成 RSA256 签名
 * 待签数据: <Method> <Endpoint>\n<Client-Id>.<Request-Time>.<Body>
 */
function signRequest(method, endpoint, clientId, requestTime, bodyString, privateKeyPem) {
  const data = `${method} ${endpoint}\n${clientId}.${requestTime}.${bodyString}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(data, 'utf8');
  const signature = sign.sign(privateKeyPem, 'base64');
  return `algorithm=RSA256, keyVersion=1, signature=${signature}`;
}

/**
 * 解析响应头中的 Signature，取出 signature 值（用于验签）
 */
function parseSignatureHeader(header) {
  if (!header) return null;
  const match = header.match(/signature=([^,\s]+)/i);
  return match ? decodeURIComponent(match[1].trim()) : null;
}

/**
 * 验签：使用万里汇公钥验证响应
 */
function verifyResponse(method, endpoint, clientId, timeString, bodyString, signatureBase64, publicKeyPem) {
  const data = `${method} ${endpoint}\n${clientId}.${timeString}.${bodyString}`;
  const verify = crypto.createVerify('RSA-SHA256');
  verify.update(data, 'utf8');
  return verify.verify(publicKeyPem, Buffer.from(signatureBase64, 'base64'));
}

/**
 * 发送 POST 请求到万里汇
 */
function post(host, endpoint, headers, body) {
  const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request({
      host,
      path: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'Client-Id': headers['Client-Id'],
        'Request-Time': headers['Request-Time'],
        'Signature': headers['Signature'],
        'Content-Length': Buffer.byteLength(bodyString, 'utf8')
      }
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json;
        try {
          json = JSON.parse(raw);
        } catch (e) {
          return reject(new Error('Invalid JSON response: ' + raw.slice(0, 200)));
        }
        resolve({ statusCode: res.statusCode, headers: res.headers, body: json, raw });
      });
    });
    req.on('error', reject);
    req.write(bodyString, 'utf8');
    req.end();
  });
}

/**
 * 创建万里汇收银台支付订单
 * @param {object} opts - { clientId, privateKeyPem, domain, orderId, amount, currency, description, paymentRedirectUrl, paymentNotifyUrl }
 * @returns {Promise<{ redirectUrl?, result?, payToSummaries?, error? }>}
 */
function createCashierPayment(opts) {
  const {
    clientId,
    privateKeyPem,
    domain,
    orderId,
    amount,
    currency,
    description,
    paymentRedirectUrl,
    paymentNotifyUrl
  } = opts;

  const host = typeof domain === 'string' && DOMAINS[domain] ? DOMAINS[domain] : domain;
  const endpoint = ENDPOINTS.create;
  const requestTime = new Date().toISOString().replace(/\.\d{3}/, '');

  const value = currency.toUpperCase() === 'JPY' ? String(amount) : (amount / 100).toFixed(2);
  const payToRequestId = `wf_${orderId}_${Date.now()}`;

  const body = {
    orderGroup: {
      orderBuyer: {
        referenceBuyerId: String(orderId)
      },
      orderGroupDescription: description || `订单#${orderId}`,
      orderGroupId: `order_group_${orderId}_${Date.now()}`,
      orders: [
        {
          orderTotalAmount: { currency: currency.toUpperCase(), value },
          orderDescription: description || `订单#${orderId}`,
          referenceOrderId: String(orderId),
          transactionTime: new Date().toISOString()
        }
      ]
    },
    industryProductCode: 'ONLINE_DIRECT_PAY',
    paymentRedirectUrl,
    paymentNotifyUrl,
    payToDetails: [
      {
        payToRequestId,
        payToAmount: { currency: currency.toUpperCase(), value },
        payToMethod: {
          paymentMethodType: 'BALANCE',
          paymentMethodDataType: 'PAYMENT_ACCOUNT_NO',
          paymentMethodData: ''
        },
        paymentNotifyUrl,
        referenceOrderId: String(orderId)
      }
    ]
  };

  const bodyString = JSON.stringify(body);
  const signature = signRequest('POST', endpoint, clientId, requestTime, bodyString, privateKeyPem);

  return post(host, endpoint, {
    'Client-Id': clientId,
    'Request-Time': requestTime,
    'Signature': signature
  }, body).then(({ body: resBody }) => {
    if (resBody.result && resBody.result.resultStatus === 'S' && resBody.actionForm) {
      let actionForm = resBody.actionForm;
      if (typeof actionForm === 'string') {
        try {
          actionForm = JSON.parse(actionForm);
        } catch (e) {
          return { error: 'Invalid actionForm', result: resBody.result };
        }
      }
      const redirectUrl = actionForm.redirectUrl;
      return {
        redirectUrl,
        result: resBody.result,
        payToSummaries: resBody.payToSummaries,
        payToRequestId
      };
    }
    return {
      error: (resBody.result && resBody.result.resultMessage) || 'Create payment failed',
      result: resBody.result,
      payToSummaries: resBody.payToSummaries
    };
  }).catch((err) => {
    return { error: err.message || String(err) };
  });
}

/**
 * 查询支付结果
 * @param {object} opts - { clientId, privateKeyPem, domain, payToRequestIds }
 */
function inquirePayment(opts) {
  const { clientId, privateKeyPem, domain, payToRequestIds } = opts;
  const host = typeof domain === 'string' && DOMAINS[domain] ? DOMAINS[domain] : domain;
  const endpoint = ENDPOINTS.inquiryPayOrder;
  const requestTime = new Date().toISOString().replace(/\.\d{3}/, '');

  const body = { payToRequestIds: Array.isArray(payToRequestIds) ? payToRequestIds : [payToRequestIds] };
  const bodyString = JSON.stringify(body);
  const signature = signRequest('POST', endpoint, clientId, requestTime, bodyString, privateKeyPem);

  return post(host, endpoint, {
    'Client-Id': clientId,
    'Request-Time': requestTime,
    'Signature': signature
  }, body).then(({ body: resBody }) => {
    return resBody;
  });
}

/**
 * 生成对万里汇通知的响应签名（集成商回复 notify 时需加签）
 */
function signNotifyResponse(clientId, responseTime, bodyString, privateKeyPem) {
  const endpoint = '/webhook/worldfirst/notify';
  const data = `POST ${endpoint}\n${clientId}.${responseTime}.${bodyString}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(data, 'utf8');
  const signature = sign.sign(privateKeyPem, 'base64');
  return `algorithm=RSA256, keyVersion=1, signature=${signature}`;
}

module.exports = {
  signRequest,
  parseSignatureHeader,
  verifyResponse,
  createCashierPayment,
  inquirePayment,
  signNotifyResponse,
  DOMAINS,
  ENDPOINTS
};
