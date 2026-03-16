import { t } from "ttag";

export const LONG_CONVO_MSG_LENGTH_THRESHOLD = 120000;

// NOTE: this is not ideal, but will get fixed w/ BOT-189 allowing us to use fixed entity_ids
export const FIXED_METABOT_IDS = {
  DEFAULT: 1 as const,
  EMBEDDED: 2 as const,
};

export const METABOT_REQUEST_IDS = {
  EMBEDDED: "c61bf5f5-1025-47b6-9298-bf1827105bb6",
};

export const FIXED_METABOT_ENTITY_IDS = {
  DEFAULT: "metabotmetabotmetabot" as const,
  EMBEDDED: "embeddedmetabotmetabo" as const,
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
  get unauthenticated() {
    return t`Metabot could not authenticate your request. Please contact your administrator.`;
  },
  get agentOffline() {
    return t`Metabot is currently offline. Please try again later.`;
  },
};

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
  get search_data_sources() {
    return t`Checking available data sources`;
  },
  get search() {
    return t`Searching`;
  },
  get search_metabase_documentation() {
    return t`Consulting the docs`;
  },
  get write_transform_python() {
    return t`Writing Python`;
  },
  get write_transform_sql() {
    return t`Writing SQL`;
  },
  get todo_write() {
    return t`Planning`;
  },
  get todo_read() {
    return t`Planning`;
  },
  get search_transforms() {
    return t`Searching transforms`;
  },
  get get_transform_details() {
    return t`Getting transform details`;
  },
  get get_field_values() {
    return t`Retrieving table metadata`;
  },
  get search_tables() {
    return t`Searching database tables`;
  },
};
