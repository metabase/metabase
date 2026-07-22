import { msgid, ngettext, t } from "ttag";

import { isEmbedding } from "metabase/embedding/config";
import { tmap } from "metabase/utils/i18n";

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

export const TOOL_CALL_MESSAGES = tmap({
  analyze_chart: () => t`Inspecting the visualization`,
  analyze_data: () => t`Analyzing the data`,
  construct_notebook_query: () => t`Creating a query`,
  get_field_values: () => t`Retrieving table metadata`,
  get_transform_details: () => t`Getting transform details`,
  list_available_fields: () => undefined,
  load_skill: () => undefined,
  read_resource: () => t`Reading resource`,
  save_entity: () => t`Saving`,
  search: () => t`Searching`,
  search_data_sources: () => t`Checking available data sources`,
  search_metabase_documentation: () => t`Consulting the docs`,
  search_tables: () => t`Searching database tables`,
  search_transforms: () => t`Searching transforms`,
  todo_read: () => t`Planning`,
  todo_write: () => t`Planning`,
  write_transform_python: () => t`Writing Python`,
  write_transform_sql: () => t`Writing SQL`,
});

// Past-tense counterparts shown once a tool call finishes. Tools without an
// entry fall back to their present-tense label.
export const TOOL_CALL_DONE_MESSAGES = tmap({
  analyze_chart: () => t`Inspected the visualization`,
  analyze_data: () => t`Analyzed the data`,
  construct_notebook_query: () => t`Created a query`,
  get_field_values: () => t`Retrieved table metadata`,
  get_transform_details: () => t`Got transform details`,
  save_entity: () => t`Saved`,
  search_data_sources: () => t`Checked available data sources`,
  search_metabase_documentation: () => t`Consulted the docs`,
  search_tables: () => t`Searched database tables`,
  search_transforms: () => t`Searched transforms`,
  todo_read: () => t`Planned`,
  todo_write: () => t`Planned`,
  write_transform_python: () => t`Wrote Python`,
  write_transform_sql: () => t`Wrote SQL`,
});

// read_resource calls come in bursts and each is near-instant, so they collapse
// into a single aggregated row instead of flashing one line each.
export const RESOURCE_TOOL_NAME = "read_resource";

export const RESOURCE_TOOL_MESSAGES = {
  active(count: number) {
    return ngettext(
      msgid`Reading ${count} resource`,
      `Reading ${count} resources`,
      count,
    );
  },
  done(count: number) {
    return ngettext(
      msgid`Read ${count} resource`,
      `Read ${count} resources`,
      count,
    );
  },
};

// reasoning under this reads as "Thought briefly"; at or above it we show the
// real elapsed seconds instead
export const REASONING_EXACT_THRESHOLD_MS = 5000;

// the collapsed header previews the latest step; each label is held on screen at
// least this long before the next replaces it, so a burst of fast tool calls
// doesn't flash by unreadably
export const PREVIEW_MIN_MS = 600;
