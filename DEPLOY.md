# 帮我部署 — 用浏览器完成部署（无需本机 Git/命令行）

任选下面一种方式，**全部在浏览器里操作**即可把网站部署到公网，在浏览器打开链接使用。

---

## 方式 A：GitHub 网页上传 + Render（推荐）

**不需要在本机安装 Git**，只需浏览器。

### 第一步：把代码上传到 GitHub

1. 打开 [GitHub](https://github.com) 并登录。
2. 点击右上角 **+** → **New repository**。
3. 仓库名随便填（如 `payment-app`），选 **Public**，点 **Create repository**。
4. 进入新建的仓库后，点击 **uploading an existing file**（或 **Add file** → **Upload files**）。
5. 把**本项目的所有文件和文件夹**拖进浏览器（或选中整个项目文件夹里的内容）：
   - `src` 文件夹（含 server.js、db.js、worldfirst.js）
   - `public` 文件夹（含 index.html、pay.html、result.html）
   - `package.json`
   - `Dockerfile`、`.dockerignore`、`render.yaml`、`.env.example`
   - `.replit`、`replit.nix`（可选）
6. 底部填 **Commit message**（如 `Initial commit`），点 **Commit changes**。

### 第二步：在 Render 部署

1. 打开 [Render](https://render.com) → 注册/登录（可用 GitHub 登录）。
2. 点击 **New** → **Web Service**。
3. 在 **Connect a repository** 里找到你刚上传的仓库，点 **Connect**。
4. 配置保持默认即可（Render 会识别 Node 项目）：
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. 如需配置 Stripe/万里汇，在 **Environment** 里添加变量（可选）：
   - `STRIPE_SECRET_KEY`
   - `WORLDFIRST_CLIENT_ID`、`WORLDFIRST_PRIVATE_KEY`、`WORLDFIRST_DOMAIN`
   - `BASE_URL` = 部署后的地址（创建完服务后 Render 会给你一个 URL，再填回来即可）。
6. 点击 **Create Web Service**，等几分钟构建完成。
7. 页面上会显示 **Your service is live at https://xxxx.onrender.com**，在浏览器打开这个链接即可使用网站。

---

## 方式 B：Replit 一键运行（最快）

在 [Replit](https://replit.com) 用浏览器就能跑起来，并得到公开访问链接。

1. 打开 [Replit](https://replit.com) → 登录/注册。
2. **Create Repl** → 选 **Import from GitHub**。
   - 若你已按方式 A 把代码推到 GitHub，填你的仓库地址（如 `https://github.com/你的用户名/payment-app`）并导入。
   - 若还没有 GitHub 仓库：选 **Template** → **Node.js**，创建空白 Repl 后，把本项目里的所有文件**复制粘贴**进 Replit 文件树（覆盖或新建对应文件）。
3. 在 Replit 里点击 **Run**（或执行 `npm install && npm start`）。
4. 运行后 Replit 会生成一个 **Webview** 链接（如 `https://xxx.replit.app`），在浏览器打开即可访问你的收付款网站。

**注意**：Replit 免费版休眠后链接会变，且不适合长期生产环境；适合快速演示。长期使用建议用方式 A（Render）。

---

## 部署后记得

- 在 **Stripe** 后台把 Webhook 地址改为：`https://你的域名/webhook/stripe`。
- 在 **万里汇** 后台把通知地址改为：`https://你的域名/webhook/worldfirst/notify`。
- 把环境变量 **BASE_URL** 设为你的实际访问地址（如 `https://xxx.onrender.com`）。

完成以上任一种方式后，你的网站就已经部署到网上，可以直接在浏览器里打开使用。
