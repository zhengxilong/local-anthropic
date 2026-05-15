export function resolveOpenAIModel(configuredModel) {
  if (typeof configuredModel === 'string' && configuredModel.trim()) {
    return configuredModel.trim()
  }

  throw new Error('OPENAI_MODEL is required. Set it in .env or pass it as an environment variable.')
}
