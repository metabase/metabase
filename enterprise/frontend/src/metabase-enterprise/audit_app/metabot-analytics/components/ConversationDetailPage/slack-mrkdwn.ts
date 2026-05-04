import { match } from "ts-pattern";

import type { MetabotChatMessage } from "metabase/metabot/state/types";

const URL_WITH_LABEL = /<((?:https?|mailto|tel):[^|>\s]+)\|([^>]+)>/g;
const BARE_URL = /<((?:https?|mailto|tel):[^|>\s]+)>/g;
const USER_MENTION = /<@([UW][A-Z0-9]+)>/g;
const CHANNEL_MENTION_WITH_NAME = /<#[CG][A-Z0-9]+\|([^>]+)>/g;
const CHANNEL_MENTION = /<#([CG][A-Z0-9]+)>/g;
const SUBTEAM_MENTION_WITH_NAME = /<!subteam\^[A-Z0-9]+\|([^>]+)>/g;
const SPECIAL_MENTION = /<!(here|channel|everyone)>/g;

export function slackMrkdwnToMarkdown(text: string): string {
  return text
    .replace(URL_WITH_LABEL, (_, url, label) => `[${label}](${url})`)
    .replace(BARE_URL, (_, url) => `<${url}>`)
    .replace(USER_MENTION, "@$1")
    .replace(CHANNEL_MENTION_WITH_NAME, "#$1")
    .replace(CHANNEL_MENTION, "#$1")
    .replace(SUBTEAM_MENTION_WITH_NAME, "@$1")
    .replace(SPECIAL_MENTION, "@$1");
}

export function convertSlackChatMessage(
  message: MetabotChatMessage,
): MetabotChatMessage {
  return match(message)
    .with({ role: "user", type: "text" }, (m) => ({
      ...m,
      message: slackMrkdwnToMarkdown(m.message),
    }))
    .with({ role: "user", type: "action" }, (m) => ({
      ...m,
      message: slackMrkdwnToMarkdown(m.message),
      userMessage: slackMrkdwnToMarkdown(m.userMessage),
    }))
    .with({ role: "agent", type: "text" }, (m) => ({
      ...m,
      message: slackMrkdwnToMarkdown(m.message),
    }))
    .with({ role: "agent", type: "data_part" }, (m) => m)
    .with({ role: "agent", type: "tool_call" }, (m) => m)
    .exhaustive();
}
