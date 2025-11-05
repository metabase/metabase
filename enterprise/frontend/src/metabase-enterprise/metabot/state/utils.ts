import { nanoid } from "@reduxjs/toolkit";

import type { SlashCommand } from "./types";

export const createMessageId = () => {
  return `msg_${nanoid()}`;
};

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
