# OpenAI to Anthropic API Proxy

一个代理服务，将 Anthropic API 格式的请求转换为 OpenAI 格式，使其能够与 OpenAI 风格的模型服务提供商兼容。

## 功能

- ✅ 完整的 API 格式转换（Anthropic → OpenAI）
- ✅ 支持流式响应（Server-Sent Events）
- ✅ 支持工具/函数调用
- ✅ 支持系统消息
- ✅ 支持图片内容（通过工具）
- ✅ 健康检查端点

## 安装

```bash
npm install
```

## 配置

创建 `.env` 文件（参考 `.env.example`）：

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入你的配置：

```env
OPENAI_BASE_URL=https://your-openai-api-endpoint.com/v1
OPENAI_API_KEY=your-api-key-here
OPENAI_MODEL=gpt-4o
PORT=3000
DEBUG=1
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

### 使用环境变量运行

```bash
OPENAI_BASE_URL=https://api.openai.com/v1 \
OPENAI_API_KEY=sk-xxx \
OPENAI_MODEL=gpt-4o \
PORT=3000 \
DEBUG=1 \
npm start
```

## 使用 Claude Code

启动代理服务后，在 Claude Code 中设置环境变量：

```bash
ANTHROPIC_BASE_URL=http://localhost:3000 claude
```

或者在你的 Claude Code 配置文件中设置 `ANTHROPIC_BASE_URL`。

## 环境变量说明

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `OPENAI_BASE_URL` | 是 | `https://api.openai.com/v1` | OpenAI 风格 API 的基础 URL |
| `OPENAI_API_KEY` | 否 | `""` | OpenAI API 密钥（如果你的服务不需要可以不填） |
| `OPENAI_MODEL` | 否 | `""` | 默认模型名称（如果不填则使用请求中的模型） |
| `PORT` | 否 | `3000` | 代理服务监听的端口 |
| `DEBUG` | 否 | `""` | 调试模式（设置为 `1` 启用） |

## API 端点

### `/v1/messages` (POST)

接收 Anthropic 格式的消息请求，转换为 OpenAI 格式后转发到配置的模型服务。

**请求示例：**

```json
{
  "model": "gpt-4o",
  "max_tokens": 1024,
  "messages": [
    {
      "role": "user",
      "content": "你好！"
    }
  ]
}
```

### `/health` (GET)

健康检查端点。

**响应示例：**

```json
{
  "status": "ok",
  "service": "openai-to-anthropic-proxy"
}
```

## 示例

### 测试代理服务

```bash
# 启动服务
npm start

# 在另一个终端测试
curl -X POST http://localhost:3000/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "max_tokens": 100,
    "messages": [
      {
        "role": "user",
        "content": "你好！"
      }
    ]
  }'
```

### 使用不同的模型提供商

#### Azure OpenAI

```env
OPENAI_BASE_URL=https://your-resource.openai.azure.com/openai/deployments/your-deployment
OPENAI_API_KEY=your-azure-key
OPENAI_MODEL=gpt-4
```

#### 本地模型服务（如 Ollama）

```env
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_API_KEY=ollama
OPENAI_MODEL=llama2
```

#### 其他兼容 OpenAI API 的服务

```env
OPENAI_BASE_URL=https://your-provider.com/v1
OPENAI_API_KEY=your-key
OPENAI_MODEL=your-model
```

## 技术栈

- Node.js
- Fastify（高性能 Web 框架）
- Server-Sent Events (SSE)

## 许可证

MIT

## 致谢

本项目参考了 [anthropic-proxy](https://github.com/maxnowack/anthropic-proxy) 的实现。
