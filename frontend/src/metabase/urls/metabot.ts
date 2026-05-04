export function newMetabotConversation({ prompt }: { prompt: string }) {
  return `/metabot/new?q=${encodeURIComponent(prompt)}`;
}
