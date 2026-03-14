# 收付款网站（Stripe + 万里汇）

支持创建订单、Stripe 银行卡（含万事达卡）支付、万里汇支付，并可直接部署到线上在浏览器中访问。

**👉 只想部署、在浏览器里用？** 看 **[DEPLOY.md](DEPLOY.md)**，用浏览器按步骤做即可，无需本机装 Git/命令行。

---

## 本地运行

```bash
npm install
cp .env.example .env
# 编辑 .env 填入 Stripe / 万里汇 等配置（可选）
npm start
```

浏览器打开：**http://localhost:3000**

---

## 部署到网站（在浏览器中访问）

### 方式一：Render（推荐，免费）

1. 将本项目推送到 **GitHub**（新建仓库后 `git add .`、`git commit`、`git push`）。
2. 打开 [Render](https://render.com) → 注册/登录 → **New** → **Web Service**。
3. 连接你的 GitHub 仓库，选择本仓库。
4. 配置：
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: 添加变量（可选）：
     - `STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`
     - `WORLDFIRST_CLIENT_ID`、`WORLDFIRST_PRIVATE_KEY`、`WORLDFIRST_DOMAIN`
     - `BASE_URL` = 部署后的地址（如 `https://xxx.onrender.com`）
5. 点击 **Create Web Service**，等待构建完成。
6. 在浏览器打开 Render 提供的 **URL**（如 `https://payment-app-xxx.onrender.com`）即可使用。

### 方式二：Docker 部署

```bash
docker build -t payment-app .
docker run -p 3000:3000 --env-file .env payment-app
```

在浏览器打开 **http://localhost:3000**。若在云服务器上运行，将 `3000` 映射到公网并配置防火墙/安全组即可从外网访问。

### 方式三：Railway / Fly.io 等

- **Railway**：New Project → Deploy from GitHub → 选仓库，自动识别 Node，需在 Variables 里填 `PORT` 和环境变量。
- **Fly.io**：`fly launch` 后选择 Dockerfile 构建并部署，同样需设置 `PORT` 和 `.env` 中的变量。

---

## 部署后必做

- 在 **Stripe** / **万里汇** 后台把 **回调地址** 改为线上地址，例如：
  - Stripe Webhook: `https://你的域名/webhook/stripe`
  - 万里汇通知地址：`https://你的域名/webhook/worldfirst/notify`
- 将 **BASE_URL** 设为 `https://你的域名`，以便支付完成跳转和万里汇回调正确。

部署完成后，用户直接在浏览器打开你的网站即可进行收款与支付。
