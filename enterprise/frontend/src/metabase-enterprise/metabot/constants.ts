import { t } from "ttag";

export const LONG_CONVO_MSG_LENGTH_THRESHOLD = 120000;

// NOTE: this is not ideal, but will get fixed w/ BOT-189 allowing us to use fixed entity_ids
export const FIXED_METABOT_IDS = {
  DEFAULT: 1 as const,
  EMBEDDED: 2 as const,
};

export function getErrorMessage() {
  return t`I'm currently offline, try again later.`;
}

// We don't need to translate this yet, as it's from ai-service which isn't translated
export const METABOT_RESULTS_MESSAGE = "Here are the results";
