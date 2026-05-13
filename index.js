#!/usr/bin/env node
import 'dotenv/config'
import Fastify from 'fastify'
import { TextDecoder } from 'util'

// 配置：从环境变量读取
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''
const PORT = process.env.PORT || 3000
const DEBUG = process.env.DEBUG === '1'
const OPENAI_MODEL = process.env.OPENAI_MODEL || '' // 可选的默认模型

const fastify = Fastify({
  logger: true
})

function debug(...args) {
  if (!DEBUG) return
  console.log('[DEBUG]', ...args)
}

// 发送 SSE 事件的辅助函数
const sendSSE = (reply, event, data) => {
  const sseMessage = `event: ${event}\n` +
                     `data: ${JSON.stringify(data)}\n\n`
  reply.raw.write(sseMessage)
  if (typeof reply.raw.flush === 'function') {
    reply.raw.flush()
  }
}

// 将 OpenAI 的 finish_reason 映射到 Anthropic 的 stop_reason
function mapStopReason(finishReason) {
  switch (finishReason) {
    case 'tool_calls': return 'tool_use'
    case 'stop': return 'end_turn'
    case 'length': return 'max_tokens'
    default: return 'end_turn'
  }
}

// 将 Anthropic 格式的消息转换为 OpenAI 格式
function convertAnthropicToOpenAI(payload) {
  const messages = []

  // 处理系统消息
  if (payload.system) {
    if (typeof payload.system === 'string') {
      messages.push({
        role: 'system',
        content: payload.system
      })
    } else if (Array.isArray(payload.system)) {
      payload.system.forEach(sysMsg => {
        const content = typeof sysMsg === 'string' ? sysMsg : 
                       (sysMsg.text || sysMsg.content || '')
        if (content) {
          messages.push({
            role: 'system',
            content: content
          })
        }
      })
    }
  }

  // 处理用户和助手消息
  if (payload.messages && Array.isArray(payload.messages)) {
    payload.messages.forEach(msg => {
      const newMsg = { role: msg.role }
      
      // 处理文本内容
      if (typeof msg.content === 'string') {
        newMsg.content = msg.content
      } else if (Array.isArray(msg.content)) {
        // 从内容数组中提取文本和 tool_use/tool_result
        const textParts = msg.content
          .filter(item => item.type === 'text')
          .map(item => item.text)
          .join('')
        
        const toolUseParts = msg.content
          .filter(item => item.type === 'tool_use')
          .map(toolCall => ({
            id: toolCall.id,
            type: 'function',
            function: {
              name: toolCall.name,
              arguments: JSON.stringify(toolCall.input)
            }
          }))
        
        if (textParts) {
          newMsg.content = textParts
        }
        if (toolUseParts.length > 0) {
          newMsg.tool_calls = toolUseParts
        }
        
        // 将 tool_result 作为单独的消息处理
        const toolResults = msg.content.filter(item => item.type === 'tool_result')
        toolResults.forEach(toolResult => {
          messages.push({
            role: 'tool',
            content: toolResult.text || toolResult.content || '',
            tool_call_id: toolResult.tool_use_id
          })
        })
      }
      
      if (newMsg.content || newMsg.tool_calls) {
        messages.push(newMsg)
      }
    })
  }

  // 将工具从 Anthropic 格式转换为 OpenAI 格式
  const tools = (payload.tools || []).map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema
    }
  }))

  return {
    messages,
    tools
  }
}

// 将 OpenAI 格式的响应转换为 Anthropic 格式
function convertOpenAIToAnthropic(data, model) {
  const choice = data.choices[0]
  const openaiMessage = choice.message

  const stopReason = mapStopReason(choice.finish_reason)
  const toolCalls = openaiMessage.tool_calls || []

  // 创建消息 ID
  const messageId = data.id
    ? data.id.replace('chatcmpl', 'msg')
    : 'msg_' + Math.random().toString(36).substr(2, 24)

  const content = []

  // 如果有文本内容，添加它
  if (openaiMessage.content) {
    content.push({
      text: openaiMessage.content,
      type: 'text'
    })
  }
  
  // 如果有 reasoning 字段（某些模型会返回推理过程），也作为文本内容
  if (openaiMessage.reasoning && !openaiMessage.content) {
    content.push({
      text: openaiMessage.reasoning,
      type: 'text'
    })
  }

  // 如果有工具调用，添加它们
  toolCalls.forEach(toolCall => {
    content.push({
      type: 'tool_use',
      id: toolCall.id,
      name: toolCall.function.name,
      input: JSON.parse(toolCall.function.arguments),
    })
  })

  return {
    content,
    id: messageId,
    model: model,
    role: openaiMessage.role,
    stop_reason: stopReason,
    stop_sequence: null,
    type: 'message',
    usage: {
      input_tokens: data.usage?.prompt_tokens || 0,
      output_tokens: data.usage?.completion_tokens || 0,
    }
  }
}

// 主端点处理器
fastify.post('/v1/messages', async (request, reply) => {
  try {
    const payload = request.body
    debug('收到 Anthropic 请求:', JSON.stringify(payload, null, 2))

    // 将 Anthropic 格式转换为 OpenAI 格式
    const { messages, tools } = convertAnthropicToOpenAI(payload)

    // 构建 OpenAI 请求体
    const openaiPayload = {
      model: payload.model || OPENAI_MODEL,
      messages,
      max_tokens: payload.max_tokens || 4096,
      temperature: payload.temperature !== undefined ? payload.temperature : 1,
      stream: payload.stream === true,
    }

    if (tools.length > 0) {
      openaiPayload.tools = tools
    }

    debug('OpenAI 请求体:', JSON.stringify(openaiPayload, null, 2))

    // 准备 OpenAI API 的请求头
    const headers = {
      'Content-Type': 'application/json'
    }

    // 如果有 API key，添加授权头
    if (OPENAI_API_KEY) {
      headers['Authorization'] = `Bearer ${OPENAI_API_KEY}`
    }

    // 调用 OpenAI API
    const openaiResponse = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(openaiPayload)
    })

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text()
      console.error('OpenAI API 错误:', errorText)
      reply.code(openaiResponse.status)
      return { 
        error: {
          type: 'api_error',
          message: `OpenAI API 错误: ${errorText}`
        }
      }
    }

    // 处理非流式响应
    if (!openaiPayload.stream) {
      const data = await openaiResponse.json()
      debug('OpenAI 响应:', JSON.stringify(data, null, 2))

      if (data.error) {
        throw new Error(data.error.message)
      }

      return convertOpenAIToAnthropic(data, openaiPayload.model)
    }

    // 处理流式响应
    let isSucceeded = false
    function sendSuccessMessage() {
      if (isSucceeded) return
      isSucceeded = true

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      })

      // 创建唯一的消息 ID
      const messageId = 'msg_' + Math.random().toString(36).substr(2, 24)

      // 发送初始的 SSE 事件表示消息开始
      sendSSE(reply, 'message_start', {
        type: 'message_start',
        message: {
          id: messageId,
          type: 'message',
          role: 'assistant',
          model: openaiPayload.model,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        }
      })

      // 发送初始 ping
      sendSSE(reply, 'ping', { type: 'ping' })
    }

    // 流处理
    let accumulatedContent = ''
    let usage = null
    let textBlockStarted = false
    let encounteredToolCall = false
    const toolCallAccumulators = {}
    const decoder = new TextDecoder('utf-8')
    const reader = openaiResponse.body.getReader()
    let done = false

    while (!done) {
      const { value, done: doneReading } = await reader.read()
      done = doneReading
      if (value) {
        const chunk = decoder.decode(value)
        debug('OpenAI 流式数据块:', chunk)

        const lines = chunk.split('\n')
        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed === '' || !trimmed.startsWith('data:')) continue
          
          const dataStr = trimmed.replace(/^data:\s*/, '')
          if (dataStr === '[DONE]') {
            // 完成流
            if (encounteredToolCall) {
              for (const idx in toolCallAccumulators) {
                sendSSE(reply, 'content_block_stop', {
                  type: 'content_block_stop',
                  index: parseInt(idx, 10)
                })
              }
            } else if (textBlockStarted) {
              sendSSE(reply, 'content_block_stop', {
                type: 'content_block_stop',
                index: 0
              })
            }

            const stopReason = encounteredToolCall ? 'tool_use' : 'end_turn'
            const outputTokens = usage 
              ? usage.completion_tokens 
              : accumulatedContent.split(' ').length

            sendSSE(reply, 'message_delta', {
              type: 'message_delta',
              delta: {
                stop_reason: stopReason,
                stop_sequence: null
              },
              usage: usage
                ? { output_tokens: outputTokens }
                : { output_tokens: outputTokens }
            })

            sendSSE(reply, 'message_stop', {
              type: 'message_stop'
            })
            reply.raw.end()
            return
          }

          try {
            const parsed = JSON.parse(dataStr)
            if (parsed.error) {
              throw new Error(parsed.error.message)
            }
            sendSuccessMessage()

            // 捕获使用情况（如果可用）
            if (parsed.usage) {
              usage = parsed.usage
            }

            // 如果没有 choices，跳过 delta 处理（这通常是最后一个只包含 usage 的数据块）
            if (!parsed.choices || parsed.choices.length === 0) {
              continue
            }

            const delta = parsed.choices[0].delta

            // 处理工具调用
            if (delta && delta.tool_calls) {
              for (const toolCall of delta.tool_calls) {
                encounteredToolCall = true
                const idx = toolCall.index

                if (toolCallAccumulators[idx] === undefined) {
                  toolCallAccumulators[idx] = ""
                  sendSSE(reply, 'content_block_start', {
                    type: 'content_block_start',
                    index: idx,
                    content_block: {
                      type: 'tool_use',
                      id: toolCall.id,
                      name: toolCall.function.name,
                      input: {}
                    }
                  })
                }

                const newArgs = toolCall.function.arguments || ""
                const oldArgs = toolCallAccumulators[idx]

                if (newArgs.length > oldArgs.length) {
                  const deltaText = newArgs.substring(oldArgs.length)
                  sendSSE(reply, 'content_block_delta', {
                    type: 'content_block_delta',
                    index: idx,
                    delta: {
                      type: 'input_json_delta',
                      partial_json: deltaText
                    }
                  })
                  toolCallAccumulators[idx] = newArgs
                }
              }
            }
            // 处理文本内容
            else if (delta && delta.content) {
              if (!textBlockStarted) {
                textBlockStarted = true
                sendSSE(reply, 'content_block_start', {
                  type: 'content_block_start',
                  index: 0,
                  content_block: {
                    type: 'text',
                    text: ''
                  }
                })
              }

              accumulatedContent += delta.content
              sendSSE(reply, 'content_block_delta', {
                type: 'content_block_delta',
                index: 0,
                delta: {
                  type: 'text_delta',
                  text: delta.content
                }
              })
            }
            // 处理推理内容（某些模型会返回推理过程）
            else if (delta && delta.reasoning) {
              if (!textBlockStarted) {
                textBlockStarted = true
                sendSSE(reply, 'content_block_start', {
                  type: 'content_block_start',
                  index: 0,
                  content_block: {
                    type: 'text',
                    text: ''
                  }
                })
              }

              accumulatedContent += delta.reasoning
              sendSSE(reply, 'content_block_delta', {
                type: 'content_block_delta',
                index: 0,
                delta: {
                  type: 'text_delta',
                  text: delta.reasoning
                }
              })
            }
          } catch (parseError) {
            console.error('解析 SSE 数据失败:', dataStr, parseError)
          }
        }
      }
    }

    reply.raw.end()
  } catch (err) {
    console.error('服务器错误:', err)
    reply.code(500)
    return { 
      error: {
        type: 'api_error',
        message: err.message
      }
    }
  }
})

// 健康检查端点
fastify.get('/health', async (request, reply) => {
  return { status: 'ok', service: 'openai-to-anthropic-proxy' }
})

// 启动服务器
const start = async () => {
  try {
    const port = parseInt(PORT)
    await fastify.listen({ port })
    console.log(`服务器运行在 http://localhost:${port}`)
    console.log(`OpenAI API 端点: ${OPENAI_BASE_URL}`)
    if (OPENAI_MODEL) {
      console.log(`默认模型: ${OPENAI_MODEL}`)
    }
    console.log('\n在 Claude Code 中使用:')
    console.log(`ANTHROPIC_BASE_URL=http://localhost:${port} claude`)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
