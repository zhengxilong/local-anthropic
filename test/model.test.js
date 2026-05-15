import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveOpenAIModel } from '../model.js'

test('prefers configured OpenAI model over request model', () => {
  assert.equal(resolveOpenAIModel('gpt-4o', 'claude-3-5-sonnet-20241022'), 'gpt-4o')
})

test('falls back to request model when no configured model is set', () => {
  assert.equal(resolveOpenAIModel('', 'gpt-4o-mini'), 'gpt-4o-mini')
})

test('uses gpt-4o as the final fallback', () => {
  assert.equal(resolveOpenAIModel('', ''), 'gpt-4o')
})
