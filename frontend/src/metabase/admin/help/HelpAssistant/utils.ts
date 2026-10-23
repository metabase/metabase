import { t } from "ttag";

import type {
  HelpAssistantChatEntry,
  HelpAssistantConversation,
  HelpAssistantConversationId,
} from "metabase-types/api";

const MAX_TITLE_LENGTH = 80;

export type HelpAssistantConversationSummary = {
  id: HelpAssistantConversationId;
  title: string;
  updatedAt: string;
};

export function getConversationTitle(
  entries: readonly HelpAssistantChatEntry[],
): string {
  const question = entries.find((entry) => entry.role === "user");
  const firstLine = question?.content.trim().split("\n")[0] ?? "";
  return firstLine.length > MAX_TITLE_LENGTH
    ? `${firstLine.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`
    : firstLine;
}

export function getRecentConversations(
  conversations: Record<HelpAssistantConversationId, HelpAssistantConversation>,
): HelpAssistantConversationSummary[] {
  return Object.entries(conversations)
    .map(([id, { title, updated_at }]) => ({
      id,
      title,
      updatedAt: updated_at,
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** The question at the end of the conversation, if the assistant hasn't answered it. */
export function getUnansweredQuestion(
  entries: readonly HelpAssistantChatEntry[],
): HelpAssistantChatEntry | undefined {
  const lastEntry = entries[entries.length - 1];
  return lastEntry?.role === "user" ? lastEntry : undefined;
}

export function withoutUnansweredQuestion(
  entries: readonly HelpAssistantChatEntry[],
): HelpAssistantChatEntry[] {
  return getUnansweredQuestion(entries) ? entries.slice(0, -1) : [...entries];
}

export function getAnswerMarkdown({
  content,
  sources = [],
}: Pick<HelpAssistantChatEntry, "content" | "sources">): string {
  if (sources.length === 0) {
    return content;
  }
  const sourceLines = sources.map(({ title, url }) => `- [${title}](${url})`);
  return [content, [t`Sources:`, ...sourceLines].join("\n")].join("\n\n");
}

export function getConversationMarkdown(
  entries: readonly HelpAssistantChatEntry[],
): string {
  return entries
    .map((entry) =>
      entry.role === "user"
        ? entry.content
            .split("\n")
            .map((line) => `> ${line}`)
            .join("\n")
        : getAnswerMarkdown(entry),
    )
    .join("\n\n");
}
