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

export const METABOT_PROFILES = {
  internal: {
    get label() {
      return t`Internal`;
    },
  },
  embedding_next: {
    get label() {
      return t`Embedding`;
    },
  },
  nlq: {
    get label() {
      return t`NLQ`;
    },
  },
  sql: {
    get label() {
      return t`SQL`;
    },
  },
  // deprecated
  slack: {
    get label() {
      return t`Slackbot`;
    },
  },
  slackbot: {
    get label() {
      return t`Slackbot`;
    },
  },
  transforms_codegen: {
    get label() {
      return t`Transforms codegen`;
    },
  },
  "document-generate-content": {
    get label() {
      return t`Documents`;
    },
  },
} as const;

export type MetabotProfileId = keyof typeof METABOT_PROFILES;

export function isMetabotProfileId(id: string): id is MetabotProfileId {
  return id in METABOT_PROFILES;
}

export function getMetabotProfileLabel(id: MetabotProfileId): string {
  return METABOT_PROFILES[id].label;
}

export function renderMetabotProfileLabel(id: string): string {
  return isMetabotProfileId(id) ? getMetabotProfileLabel(id) : id;
}

export const METABOT_PROFILE_OVERRIDES = {
  DEFAULT: undefined,
  SQL: "sql",
  TRANSFORMS_CODEGEN: "transforms_codegen",
} as const satisfies Record<string, MetabotProfileId | undefined>;

export const METABOT_ERR_MSG = {
  get default() {
    return t`Sorry, I ran into an error. Could you please try that again?`;
  },
  unauthenticated(metabotName: string) {
    return t`${metabotName} could not authenticate your request. Please contact your administrator.`;
  },
  get locked() {
    return t`You've used all of your included AI service tokens. To keep using AI features you can either end your trial early and start your subscription, or stay in the trial and add your own AI provider API key.`;
  },
  format(msg: string) {
    return t`Sorry, an error occurred: ${msg}. If this persists, please contact your administrator.`;
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
  get list_collections() {
    return t`Browsing collections`;
  },
  get get_collection() {
    return t`Reading collection details`;
  },
  get list_collection_items() {
    return t`Listing collection contents`;
  },
  get create_collection() {
    return t`Creating a collection`;
  },
  get save_card() {
    return t`Saving the question`;
  },
  get update_collection() {
    return t`Updating the collection`;
  },
  get move_collection() {
    return t`Moving the collection`;
  },
  get update_card() {
    return t`Updating the question`;
  },
  get move_card() {
    return t`Moving the question`;
  },
  get archive_card() {
    return t`Archiving the question`;
  },
  get copy_card() {
    return t`Duplicating the question`;
  },
  get archive_collection() {
    return t`Archiving the collection`;
  },
  get verify_card() {
    return t`Updating verification status`;
  },
  get create_dashboard() {
    return t`Creating a dashboard`;
  },
  get update_dashboard() {
    return t`Updating the dashboard`;
  },
  get move_dashboard() {
    return t`Moving the dashboard`;
  },
  get archive_dashboard() {
    return t`Archiving the dashboard`;
  },
  get copy_dashboard() {
    return t`Duplicating the dashboard`;
  },
  get create_dashboard_public_link() {
    return t`Creating a public link`;
  },
  get delete_dashboard_public_link() {
    return t`Removing the public link`;
  },
};
