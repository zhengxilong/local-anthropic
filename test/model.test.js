import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveOpenAIModel } from '../model.js'

test('prefers configured OpenAI model over request model', () => {
  assert.equal(resolveOpenAIModel('gpt-4o', 'claude-3-5-sonnet-20241022'), 'gpt-4o')
})

test('uses configured OpenAI model when request model is missing', () => {
  assert.equal(resolveOpenAIModel('deepseek-chat'), 'deepseek-chat')
})

test('requires a configured model instead of using the request model', () => {
  assert.throws(
    () => resolveOpenAIModel('', 'gpt-4o-mini'),
    /OPENAI_MODEL is required/
  )
})
