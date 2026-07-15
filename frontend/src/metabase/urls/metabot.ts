export function newMetabotConversation({ prompt }: { prompt: string }) {
  return `/metabot/new?q=${encodeURIComponent(prompt)}`;
}

export function metabotConversation(conversationId: string) {
  return `/metabot/conversation/${conversationId}`;
}
