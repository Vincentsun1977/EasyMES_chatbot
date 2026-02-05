# EasyMES chatbot-app

## 打包与部署到测试环境

下面是几种用于将本项目打包并部署到测试环境的常用方式。

- 本地构建并导出 Docker 镜像（Windows PowerShell）：

```powershell
# 在项目根目录运行：
powershell -File scripts\build-image.ps1 -ImageName chatbot-app -Tag v1.0 -SavePath chatbot-app-v1.0.tar
```

- Linux / macOS 本地构建并导出 Docker 镜像：

```bash
# 先给予执行权限（可选）
chmod +x scripts/build-image.sh
./scripts/build-image.sh -i chatbot-app -t v1.0 -s chatbot-app-v1.0.tar
```

- 构建并推送到私有镜像仓库（Linux runner 示例）：

```bash
./scripts/build-image.sh -i chatbot-app -t v1.0 -s chatbot-app-v1.0.tar -r myregistry.example.com/myrepo -p
```

- 构建并推送到私有镜像仓库（需提供注册表地址）：

```powershell
powershell -File scripts\build-image.ps1 -ImageName chatbot-app -Tag v1.0 -Registry myregistry.example.com/myrepo -Push -SavePath chatbot-app-v1.0.tar
```

- 在测试服务器上加载并运行镜像：

```bash
docker load -i chatbot-app-v1.0.tar
docker run -d -p 8000:8000 chatbot-app:v1.0
```

- 使用 docker-compose（如果希望在目标环境直接用 compose 启动）：

```bash
docker-compose up --build -d
```

该项目已包含 `Dockerfile` 和 `docker-compose.yml`，如需在 CI 中自动化打包并推送镜像，可在 CI 步骤中调用 `scripts/build-image.ps1`（Linux runner 可用等效 shell 脚本或直接运行 `docker build`/`docker push`）。

# Dify Chatbot API

基于 Dify AI 平台的聊天机器人应用，提供 REST API 和 WebSocket 接口，支持 iframe 嵌入。

## 🚀 功能特性

- ✅ **RESTful API** - 标准的 HTTP API 接口
- ✅ **流式响应** - Server-Sent Events (SSE) 实时流式回复
- ✅ **WebSocket** - 双向实时通信
- ✅ **会话管理** - 支持多轮对话和会话历史
- ✅ **Web UI** - 内置的聊天界面，可通过 iframe 嵌入
- ✅ **Docker 部署** - 完整的容器化方案
- ✅ **CORS 支持** - 支持跨域访问和 iframe 嵌入

## 📋 系统要求

- Python 3.11+
- Docker & Docker Compose (用于容器化部署)

## 🛠️ 快速开始

### 方式1: Docker 部署（推荐）

1. **克隆项目并进入目录**
```bash
cd chatbot-app
```

2. **配置环境变量**
```bash
# .env 文件已包含 Dify API 配置
# 如需修改，请编辑 .env 文件
```

3. **构建并启动容器**
```bash
docker-compose up -d
```

4. **查看日志**
```bash
docker-compose logs -f
```

5. **访问应用**
- Web UI: http://localhost:8000
- API 文档: http://localhost:8000/docs
- 健康检查: http://localhost:8000/health

6. **停止服务**
```bash
docker-compose down
```

### 方式2: 本地开发

1. **创建虚拟环境**
```bash
python -m venv venv
```

2. **激活虚拟环境**
```bash
# Windows
venv\Scripts\activate

# Linux/Mac
source venv/bin/activate
```

3. **安装依赖**
```bash
pip install -r requirements.txt
```

4. **运行应用**
```bash
python app/main.py
```

或使用 uvicorn：
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## 📡 API 使用说明

### 1. 发送消息（阻塞模式）

```bash
POST /api/v1/chat
Content-Type: application/json

{
  "query": "你好，请介绍一下自己",
  "conversation_id": "",  # 可选，用于继续对话
  "user": "user-123",
  "inputs": {}
}
```

### 2. 发送消息（流式模式）

```bash
POST /api/v1/chat/stream
Content-Type: application/json

{
  "query": "请详细解释一下人工智能",
  "conversation_id": "",
  "user": "user-123",
  "inputs": {}
}
```

返回 Server-Sent Events (SSE) 流：
```
data: {"event": "message", "answer": "人工智能是..."}

data: {"event": "message_end", "conversation_id": "xxx"}
```

### 3. WebSocket 连接

```javascript
const ws = new WebSocket('ws://localhost:8000/api/v1/chat/ws');

ws.onopen = () => {
  ws.send(JSON.stringify({
    query: "你好",
    user: "user-123"
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data);
};
```

### 4. 获取对话历史

```bash
GET /api/v1/conversations?user=user-123
```

## 🎨 iframe 嵌入方式

在其他网页中嵌入聊天界面：

```html
<iframe 
  src="http://localhost:8000" 
  width="400" 
  height="600" 
  frameborder="0"
  style="border-radius: 10px; box-shadow: 0 2px 12px rgba(0,0,0,0.1);"
></iframe>
```

## 🔧 配置说明

编辑 `.env` 文件修改配置：

```env
# Dify API 配置
DIFY_API_URL=https://test.nas-save.abb.com/v1
DIFY_API_KEY=app-Y3ScvBwBtTIujre0tyAj6aQg

# 应用配置
APP_HOST=0.0.0.0
APP_PORT=8000
APP_DEBUG=False

# CORS 配置（逗号分隔）
ALLOWED_ORIGINS=*
```

## 📁 项目结构

```
chatbot-app/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI 应用入口
│   ├── config.py            # 配置管理
│   ├── api/
│   │   ├── chat.py          # 聊天 API 端点
│   │   └── health.py        # 健康检查
│   ├── services/
│   │   └── dify_client.py   # Dify API 客户端
│   ├── models/
│   │   └── schemas.py       # 数据模型
│   └── static/
│       ├── index.html       # 聊天 UI
│       ├── chat.js          # 前端逻辑
│       └── chat.css         # 样式
├── .env                     # 环境变量
├── requirements.txt         # Python 依赖
├── Dockerfile              # Docker 镜像
├── docker-compose.yml      # Docker Compose 配置
└── README.md               # 项目文档
```

## 🐳 Docker 命令参考

```bash
# 构建镜像
docker build -t dify-chatbot .

# 运行容器
docker run -d -p 8000:8000 --env-file .env --name chatbot dify-chatbot

# 查看日志
docker logs -f chatbot

# 进入容器
docker exec -it chatbot bash

# 停止容器
docker stop chatbot

# 删除容器
docker rm chatbot
```

## 🔍 健康检查

```bash
curl http://localhost:8000/health
```

返回：
```json
{
  "status": "healthy",
  "timestamp": "2026-01-16T12:00:00",
  "dify_api_url": "https://test.nas-save.abb.com/v1"
}
```

## 🧪 测试

```bash
# 测试聊天 API
curl -X POST http://localhost:8000/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"query": "你好", "user": "test-user"}'
```

## 📝 开发说明

### 添加新功能

1. 在 `app/api/` 创建新的路由模块
2. 在 `app/services/` 添加业务逻辑
3. 在 `app/models/schemas.py` 定义数据模型
4. 在 `app/main.py` 注册新路由

### 前端开发

- 修改 `app/static/index.html` - UI 结构
- 修改 `app/static/chat.css` - 样式
- 修改 `app/static/chat.js` - 交互逻辑

## 🚀 生产部署建议

1. **使用反向代理 (Nginx)**
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

2. **配置 HTTPS**
3. **限制 CORS 来源** - 将 `ALLOWED_ORIGINS` 设置为具体域名
4. **设置速率限制**
5. **启用日志记录和监控**

## ❓ 常见问题

**Q: 如何修改端口？**
A: 编辑 `.env` 文件中的 `APP_PORT`，或修改 `docker-compose.yml` 中的端口映射。

**Q: 如何查看详细日志？**
A: 设置 `.env` 中 `APP_DEBUG=True`，然后查看容器日志。

**Q: 如何自定义 UI？**
A: 修改 `app/static/` 目录下的 HTML/CSS/JS 文件。

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📧 联系方式

如有问题请联系项目维护者。
