import { nanoid } from "@reduxjs/toolkit";

import type {
  MetabotAgentChainOfThoughtMessage,
  MetabotAgentTextChatMessage,
  MetabotGeneratedCardPart,
  MetabotMessage,
  MetabotMessagePart,
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
