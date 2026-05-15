export function resolveOpenAIModel(configuredModel, requestModel) {
  if (typeof configuredModel === 'string' && configuredModel.trim()) {
    return configuredModel.trim()
  }

  if (typeof requestModel === 'string' && requestModel.trim()) {
    return requestModel.trim()
  }

  return 'gpt-4o'
}
