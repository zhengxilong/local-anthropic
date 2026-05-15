# Local Anthropic

一个代理服务，将 Anthropic API 格式的请求转换为 OpenAI 格式，使其能够与 OpenAI 风格的模型服务提供商兼容。专为 [Claude Code](https://claude.ai/code) 设计。

## 手动安装

```bash
git clone https://github.com/zhengxilong/local-anthropic.git
cd local-anthropic
npm install
cp .env.example .env
# 编辑 .env 填入配置
npm start
```

这也是推荐的安装方式。当前不再支持通过 `install.sh` 一键安装。

## 配置

创建 `.env` 文件（参考 `.env.example`）：

```env
OPENAI_BASE_URL=https://your-openai-api-endpoint.com/v1
OPENAI_API_KEY=your-api-key-here
OPENAI_MODEL=gpt-4o
PORT=3000
DEBUG=0
```

## 运行

### 开发模式

```bash
npm run dev
```

### 生产模式

```bash
npm start
```

或者直接使用 Node.js：

```bash
node index.js
```

### 使用环境变量启动

```bash
OPENAI_BASE_URL=https://api.openai.com/v1 \
OPENAI_API_KEY=sk-xxx \
OPENAI_MODEL=gpt-4o \
PORT=3000 \
DEBUG=0 \
npm start
```

## 使用 Claude Code

启动代理后：

```bash
ANTHROPIC_BASE_URL=http://localhost:3000
```

## 功能

- Anthropic → OpenAI API 格式转换
- 流式响应（SSE）
- 工具/函数调用
- 系统消息
- 推理内容（reasoning）支持
- 健康检查端点

## 支持的模型提供商

任何兼容 OpenAI `/chat/completions` 接口的服务均可使用：

```env
# Azure OpenAI
OPENAI_BASE_URL=https://your-resource.openai.azure.com/openai/deployments/your-deployment
OPENAI_API_KEY=your-azure-key
OPENAI_MODEL=gpt-4

# Ollama
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_API_KEY=ollama
OPENAI_MODEL=llama2

# DeepSeek / 其他 OpenAI 兼容服务
OPENAI_BASE_URL=https://api.deepseek.com/v1
OPENAI_API_KEY=your-key
OPENAI_MODEL=deepseek-chat
```

## API 端点

### `POST /v1/messages`

接收 Anthropic 格式请求，转换后转发到 OpenAI 兼容后端。

### `GET /health`

健康检查。

## 技术栈

- Node.js (>= 18)
- Fastify
- Server-Sent Events

## 许可证

MIT
