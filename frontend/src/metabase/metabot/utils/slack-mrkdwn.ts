import type {
  MetabotMessage,
  MetabotMessagePart,
} from "metabase/metabot/state/types";

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

function convertSlackMessagePart(part: MetabotMessagePart): MetabotMessagePart {
  if (part.type !== "text") {
    return part;
  }
  const message = slackMrkdwnToMarkdown(part.message);
  return message === part.message ? part : { ...part, message };
}

export function convertSlackMessage(message: MetabotMessage): MetabotMessage {
  const parts = message.parts.map(convertSlackMessagePart);
  return parts.some((part, index) => part !== message.parts[index])
    ? { ...message, parts }
    : message;
}
