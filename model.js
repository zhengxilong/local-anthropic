export function resolveOpenAIModel(configuredModel, requestModel) {
  if (typeof configuredModel === 'string' && configuredModel.trim()) {
    return configuredModel.trim()
  }

  return 'gpt-4o'
}
