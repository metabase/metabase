import { t } from "ttag";

export const LONG_CONVO_MSG_LENGTH_THRESHOLD = 120000;

// NOTE: this is not ideal, but will get fixed w/ BOT-189 allowing us to use fixed entity_ids
export const FIXED_METABOT_IDS = {
  DEFAULT: 1 as const,
  EMBEDDED: 2 as const,
  SLACKBOT: 3 as const,
};

export const METABOT_REQUEST_IDS = {
  EMBEDDED: "c61bf5f5-1025-47b6-9298-bf1827105bb6",
};

export const FIXED_METABOT_ENTITY_IDS = {
  DEFAULT: "metabotmetabotmetabot" as const,
  EMBEDDED: "embeddedmetabotmetabo" as const,
  SLACKBOT: "slackbotmetabotmetabo" as const,
};

export const METABOT_PROFILE_OVERRIDES = {
  DEFAULT: undefined,
  SQL: "sql",
  TRANSFORMS_CODEGEN: "transforms_codegen",
};

export const METABOT_ERR_MSG = {
  get default() {
    return t`Sorry, I ran into an error. Could you please try that again?`;
  },
  unauthenticated(metabotName: string) {
    return t`${metabotName} could not authenticate your request. Please contact your administrator.`;
  },
  format(msg: string) {
    return t`Sorry, an error occurred: ${msg}. If this persists, please contact your administrator.`;
  },
};

export const TOOL_CALL_MESSAGES: Record<string, string | undefined> = {
  get ["construct-notebook-query"]() {
    return t`Creating a query`;
  },
  get ["analyze-data"]() {
    return t`Analyzing the data`;
  },
  get ["analyze-chart"]() {
    return t`Inspecting the visualization`;
  },
  get ["list-available-fields"]() {
    return undefined;
  },
  get ["search-data-sources"]() {
    return t`Checking available data sources`;
  },
  get search() {
    return t`Searching`;
  },
  get ["search-metabase-documentation"]() {
    return t`Consulting the docs`;
  },
  get ["write-transform-python"]() {
    return t`Writing Python`;
  },
  get ["write-transform-sql"]() {
    return t`Writing SQL`;
  },
  get ["todo-write"]() {
    return t`Planning`;
  },
  get ["todo-read"]() {
    return t`Planning`;
  },
  get ["search-transforms"]() {
    return t`Searching transforms`;
  },
  get ["get-transform-details"]() {
    return t`Getting transform details`;
  },
  get ["get-field-values"]() {
    return t`Retrieving table metadata`;
  },
  get ["search-tables"]() {
    return t`Searching database tables`;
  },
};
