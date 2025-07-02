import { t } from "ttag";

export const LONG_CONVO_MSG_LENGTH_THRESHOLD = 120000;

// NOTE: this is not ideal, but will get fixed w/ BOT-189 allowing us to use fixed entity_ids
export const FIXED_METABOT_IDS = {
  DEFAULT: 1 as const,
  EMBEDDED: 2 as const,
};

export const METABOT_ERR_MSG = {
  get default() {
    return t`Sorry, I ran into an error. Could you please try that again?`;
  },
  get agentOffline() {
    return t`Metabot is currently offline. Please try again later.`;
  },
};

// We don't need to translate this yet, as it's from ai-service which isn't translated
export const METABOT_RESULTS_MESSAGE = "Here are the results";

export const TOOL_CALL_MESSAGES: Record<string, string | undefined> = {
  get construct_notebook_query() {
    return t`Creating a query`;
  },
  get analyze_data() {
    return t`Analyzing the data`;
  },
  get analyze_chart() {
    return t`Inspecting the visualization`;
  },
  get list_available_fields() {
    return undefined;
  },
};
