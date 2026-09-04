import { nanoid } from "@reduxjs/toolkit";

import type {
  MetabotAgentChainOfThoughtMessage,
  MetabotChatMessage,
  SlashCommand,
} from "./types";

export const createMessageId = () => {
  return `msg_${nanoid()}`;
};

export const isChainOfThoughtMessage = (
  message: MetabotChatMessage,
): message is MetabotAgentChainOfThoughtMessage =>
  message.type === "chain_of_thought";

export const hasInProgressMessage = (messages: MetabotChatMessage[]): boolean =>
  messages.some((message) => message.type === "turn_in_progress");

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
