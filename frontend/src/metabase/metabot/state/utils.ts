import { nanoid } from "@reduxjs/toolkit";

import type { MetabotChatMessage, SlashCommand } from "./types";

export const createMessageId = () => {
  return `msg_${nanoid()}`;
};

// A `turn_in_progress` message means the latest turn is still streaming.
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
