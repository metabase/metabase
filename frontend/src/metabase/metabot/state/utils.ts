import { nanoid } from "@reduxjs/toolkit";

import type {
  MetabotAgentChainOfThoughtMessage,
  MetabotMessage,
  MetabotMessagePart,
  SlashCommand,
} from "./types";

export const createMessageId = () => {
  return `msg_${nanoid()}`;
};

export const isChainOfThoughtMessage = (
  part: MetabotMessagePart,
): part is MetabotAgentChainOfThoughtMessage =>
  part.type === "chain_of_thought";

export const hasInProgressMessage = (messages: MetabotMessage[]): boolean =>
  messages.at(-1)?.status.type === "in_progress";

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
