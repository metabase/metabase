import { nanoid } from "@reduxjs/toolkit";

import { isEmbedding } from "metabase/embedding-sdk/config";
import { useSelector } from "metabase/lib/redux";

import { FIXED_METABOT_IDS, METABOT_REQUEST_IDS } from "../constants";

import { getMetabot } from "./selectors";
import type { SlashCommand } from "./types";

/**
 * Creates a unique message ID with a "msg_" prefix.
 * @returns A unique message identifier string
 */
export const createMessageId = () => {
  return `msg_${nanoid()}`;
};

/**
 * Parses a slash command from a message string.
 * @param message - The message string to parse (e.g., "/help" or "/search query")
 * @returns The parsed slash command object with cmd and args, or undefined if no valid command is found
 */
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

/**
 * Gets the appropriate Metabot ID based on the embedding context.
 * @param isEmbedding - Whether the application is running in an embedded context
 * @returns The Metabot ID for embedded or default contexts
 */
export const getMetabotId = (isEmbedding: boolean) => {
  return isEmbedding ? FIXED_METABOT_IDS.EMBEDDED : FIXED_METABOT_IDS.DEFAULT;
};

/**
 * Hook that returns the appropriate Metabot request ID based on current state and embedding context.
 * This replaces the previous selector-based approach for better hook compatibility.
 * @returns The Metabot request ID - either an override value, the embedded ID, or undefined
 */
export function useMetabotRequestId() {
  const metabot = useSelector(getMetabot as any) as ReturnType<
    typeof getMetabot
  >;

  if (metabot.experimental.metabotReqIdOverride) {
    return metabot.experimental.metabotReqIdOverride;
  }

  return isEmbedding() ? METABOT_REQUEST_IDS.EMBEDDED : undefined;
}
