const EXPORT_FORMAT = "metabase.metabot-conversation";
const EXPORT_VERSION = 1;

type ConversationExportOptions = {
  /** ISO 8601 timestamp of the export */
  exportedAt: string;
  /** The instance's version tag, or `null` when unknown */
  metabaseVersion: string | null;
};

/**
 * The conversation detail exactly as the API sent it (`rawConversationJson`,
 * the response text), every branch included, in a versioned envelope that
 * says what it is and when it was exported. Compact JSON. Throws when the
 * response text isn't JSON, so the file can't be invalid.
 */
export function conversationExportJson(
  rawConversationJson: string,
  { exportedAt, metabaseVersion }: ConversationExportOptions,
): string {
  // Only checks the text is JSON; the parsed value is discarded.
  JSON.parse(rawConversationJson);
  const envelope = JSON.stringify({
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exported_at: exportedAt,
    metabase_version: metabaseVersion,
  });
  // Spliced in as text: parsing the conversation would round integers above 2^53.
  return `${envelope.slice(0, -1)},"conversation":${rawConversationJson}}`;
}

export function conversationExportFileName(conversationId: string): string {
  return `metabot-conversation-${conversationId}.json`;
}
