import { nanoid } from "@reduxjs/toolkit";

import { useSelector } from "metabase/lib/redux";

import { FIXED_METABOT_IDS, METABOT_REQUEST_IDS } from "../constants";

import { getMetabot } from "./selectors";
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

export const getMetabotId = (isEmbedding: boolean) => {
  return isEmbedding ? FIXED_METABOT_IDS.EMBEDDED : FIXED_METABOT_IDS.DEFAULT;
};

export function useMetabotRequestId() {
  const metabot = useSelector(getMetabot as any) as ReturnType<
    typeof getMetabot
  >;

  if (metabot.experimental.metabotReqIdOverride) {
    return METABOT_REQUEST_IDS.EMBEDDED;
  }

  return undefined;
}
