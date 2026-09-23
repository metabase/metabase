import { nanoid } from "@reduxjs/toolkit";

import type { TokenUsage } from "metabase/api/ai-streaming/sse-types";

import type {
  MetabotAgentChainOfThoughtMessage,
  MetabotAgentTextChatMessage,
  MetabotDataPart,
  MetabotGeneratedCardPart,
  MetabotMessage,
  MetabotMessagePart,
  MetabotTokenUsage,
  MetabotUserTextChatMessage,
  SlashCommand,
} from "./types";

export const createMessageId = () => {
  return `msg_${nanoid()}`;
};

export const isChainOfThoughtMessage = (
  part: MetabotMessagePart,
): part is MetabotAgentChainOfThoughtMessage =>
  part.type === "chain_of_thought";

export const isTextPart = (
  part: MetabotMessagePart,
): part is MetabotUserTextChatMessage | MetabotAgentTextChatMessage =>
  part.type === "text";

export const isGeneratedCardPart = (
  part: MetabotMessagePart,
): part is MetabotGeneratedCardPart =>
  part.type === "data_part" &&
  part.part.type === "data-generated_entity" &&
  part.part.data.type === "card";

const METABOT_DATA_PART_TYPES: Record<MetabotDataPart["type"], true> = {
  "data-navigate_to": true,
  "data-todo_list": true,
  "data-code_edit": true,
  "data-transform_suggestion": true,
  "data-generated_entity": true,
  "data-entity_saved": true,
  "data-page_link": true,
  "data-adhoc_viz": true,
  "data-static_viz": true,
  "data-research_plan_update": true,
};

// Persisted history can hold data parts this client has no renderer for (e.g.
// the eval harness's `data-eval_session`), which the stream path already drops.
export const isRenderableMessagePart = (part: MetabotMessagePart): boolean =>
  part.type !== "data_part" ||
  Object.hasOwn(METABOT_DATA_PART_TYPES, part.part.type);

export const toMetabotTokenUsage = (usage: TokenUsage): MetabotTokenUsage => ({
  inputTokens: usage.inputTokens,
  outputTokens: usage.outputTokens,
  cacheCreationTokens: usage.cacheCreationTokens ?? 0,
  cacheReadTokens: usage.cacheReadTokens ?? 0,
});

export const addTokenUsage = (
  a: MetabotTokenUsage | undefined,
  b: MetabotTokenUsage | undefined,
): MetabotTokenUsage | undefined =>
  a && b
    ? {
        inputTokens: a.inputTokens + b.inputTokens,
        outputTokens: a.outputTokens + b.outputTokens,
        cacheCreationTokens: a.cacheCreationTokens + b.cacheCreationTokens,
        cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
      }
    : (a ?? b);

export const hasInProgressMessage = (messages: MetabotMessage[]): boolean =>
  messages.some((message) => message.status.type === "in_progress");

export const parseSlashCommand = (
  message: string,
): SlashCommand | undefined => {
  const { cmd, args } =
    message.match(/^\/(?<cmd>\w+)(?:\s(?<args>.+))?/)?.groups || {};

  if (!cmd) {
    return undefined;
  }

  return {
    cmd,
    args: args ? args.split(" ") : [],
  };
};
