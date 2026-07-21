import { t } from "ttag";

import { isEmbedding } from "metabase/embedding/config";
import type { IconName } from "metabase-types/api";

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
  NLQ: "nlq",
  SQL: "sql",
  TRANSFORMS_CODEGEN: "transforms_codegen",
} as const satisfies Record<string, MetabotProfileId | undefined>;

export const isHistoryEnabledProfile = (profile: string | undefined) =>
  profile === undefined || profile === "nlq";

export const resolveMetabotProfileId = (
  profile: MetabotProfileId | undefined,
): MetabotProfileId =>
  profile ?? (isEmbedding() ? "embedding_next" : "internal");

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
  get outOfSync() {
    return t`This conversation was updated elsewhere. Please refresh to see the latest messages.`;
  },
  format(msg: string) {
    return t`Sorry, an error occurred: ${msg}. If this persists, please contact your administrator.`;
  },
};

export const TOOL_CALL_MESSAGES: Record<string, string | undefined> = {
  get analyze_chart() {
    return t`Inspecting the visualization`;
  },
  get analyze_data() {
    return t`Analyzing the data`;
  },
  get construct_notebook_query() {
    return t`Creating a query`;
  },
  get get_field_values() {
    return t`Retrieving table metadata`;
  },
  get get_transform_details() {
    return t`Getting transform details`;
  },
  get save_entity() {
    return t`Saving`;
  },
  get list_available_fields() {
    return undefined;
  },
  get load_skill() {
    return t`Loading skill`;
  },
  get read_resource() {
    return t`Reading resource`;
  },
  get search() {
    return t`Searching`;
  },
  get search_data_sources() {
    return t`Checking available data sources`;
  },
  get search_metabase_documentation() {
    return t`Consulting the docs`;
  },
  get search_tables() {
    return t`Searching database tables`;
  },
  get search_transforms() {
    return t`Searching transforms`;
  },
  get todo_read() {
    return t`Planning`;
  },
  get todo_write() {
    return t`Planning`;
  },
  get write_transform_python() {
    return t`Writing Python`;
  },
  get write_transform_sql() {
    return t`Writing SQL`;
  },
};

// Per-tool icon for the chain-of-thought timeline; unmapped tools get
// DEFAULT_TOOL_CALL_ICON.
export const TOOL_CALL_ICONS: Record<string, IconName> = {
  analyze_chart: "bar",
  analyze_data: "insight",
  construct_notebook_query: "notebook",
  get_field_values: "list",
  get_transform_details: "info",
  list_available_fields: "list",
  load_skill: "book_open",
  read_resource: "document",
  search: "search",
  search_data_sources: "database",
  search_metabase_documentation: "reference",
  search_tables: "database",
  search_transforms: "search",
  todo_read: "ordered_list",
  todo_write: "ordered_list",
  write_transform_python: "function",
  write_transform_sql: "database",
};

export const DEFAULT_TOOL_CALL_ICON: IconName = "bolt";
