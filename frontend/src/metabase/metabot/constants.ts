import { msgid, ngettext, t } from "ttag";

import { isEmbedding } from "metabase/embedding/config";

export const CONTEXT_WINDOW_WARNING_PERCENT = 90;

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
  explorations: {
    get label() {
      return t`Research`;
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
  megabot: {
    get label() {
      return t`Megabot`;
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
  MEGABOT: "megabot",
  EXPLORATIONS: "explorations",
} as const satisfies Record<string, MetabotProfileId | undefined>;

const HISTORY_ENABLED_PROFILES: ReadonlySet<string | undefined> = new Set([
  METABOT_PROFILE_OVERRIDES.DEFAULT,
  METABOT_PROFILE_OVERRIDES.NLQ,
  METABOT_PROFILE_OVERRIDES.MEGABOT,
]);

export const isHistoryEnabledProfile = (profile: string | undefined) =>
  HISTORY_ENABLED_PROFILES.has(profile);

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

export type ToolMessage = {
  active: (count?: number) => string | undefined;
  done: (count?: number) => string | undefined;
};

export const TOOL_MESSAGES = {
  analyze_chart: {
    active: () => t`Inspecting the visualization`,
    done: () => t`Inspected the visualization`,
  },
  ask_user: {
    active: () => t`Asking for clarification`,
    done: () => t`Asked for clarification`,
  },
  analyze_data: {
    active: () => t`Analyzing the data`,
    done: () => t`Analyzed the data`,
  },
  // writes replace the done label with a tool_title naming what changed, so it only shows for reads
  call_api: {
    active: () => t`Working on it`,
    done: () => t`Looked up details`,
  },
  construct_notebook_query: {
    active: () => t`Creating a query`,
    done: () => t`Created a query`,
  },
  // API discovery is plumbing the user doesn't need to see
  describe_api_endpoint: { active: () => undefined, done: () => undefined },
  describe_app_db: {
    active: () => t`Reading the app database schema`,
    done: () => t`Read the app database schema`,
  },
  get_field_values: {
    active: () => t`Retrieving table metadata`,
    done: () => t`Retrieved table metadata`,
  },
  get_transform_details: {
    active: () => t`Getting transform details`,
    done: () => t`Got transform details`,
  },
  list_api_endpoints: { active: () => undefined, done: () => undefined },
  list_available_fields: { active: () => undefined, done: () => undefined },
  load_mcp_tools: {
    active: () => t`Loading external tools`,
    done: () => t`Loaded external tools`,
  },
  load_skill: { active: () => undefined, done: () => undefined },
  query_app_db: {
    active: () => t`Reading app metadata`,
    done: () => t`Read app metadata`,
  },
  run_warehouse_query: {
    active: () => t`Querying the warehouse`,
    done: () => t`Queried the warehouse`,
  },
  run_warehouse_sql: {
    active: () => t`Running SQL`,
    done: () => t`Ran SQL`,
  },
  show_result: {
    active: () => t`Rendering the result`,
    done: () => t`Rendered the result`,
  },
  write_note: {
    active: () => t`Saving a note`,
    done: () => t`Saved a note`,
  },
  read_note: {
    active: () => t`Reading notes`,
    done: () => t`Read notes`,
  },
  delete_note: {
    active: () => t`Deleting a note`,
    done: () => t`Deleted a note`,
  },
  read_web_page: {
    active: () => t`Reading web page`,
    done: () => t`Read web page`,
  },
  read_resource: {
    active: (count) =>
      count == null
        ? t`Reading resource`
        : ngettext(
            msgid`Reading ${count} resource`,
            `Reading ${count} resources`,
            count,
          ),
    done: (count) =>
      count == null
        ? t`Read resource`
        : ngettext(
            msgid`Read ${count} resource`,
            `Read ${count} resources`,
            count,
          ),
  },
  save_entity: { active: () => t`Saving`, done: () => t`Saved` },
  // a settled save replaces the done label with a tool_title naming what was saved and where
  save_result: {
    active: () => t`Saving the result`,
    done: () => t`Saved the result`,
  },
  navigate: {
    active: () => t`Navigating`,
    done: () => t`Navigated`,
  },
  search: { active: () => t`Searching`, done: () => t`Searched` },
  search_data_sources: {
    active: () => t`Checking available data sources`,
    done: () => t`Checked available data sources`,
  },
  search_metabase_documentation: {
    active: () => t`Consulting the docs`,
    done: () => t`Consulted the docs`,
  },
  search_tables: {
    active: () => t`Searching database tables`,
    done: () => t`Searched database tables`,
  },
  search_transforms: {
    active: () => t`Searching transforms`,
    done: () => t`Searched transforms`,
  },
  todo_read: { active: () => t`Planning`, done: () => t`Planned` },
  todo_write: { active: () => t`Planning`, done: () => t`Planned` },
  web_search: {
    active: () => t`Searching the web`,
    done: () => t`Searched the web`,
  },
  write_transform_python: {
    active: () => t`Writing Python`,
    done: () => t`Wrote Python`,
  },
  write_transform_sql: {
    active: () => t`Writing SQL`,
    done: () => t`Wrote SQL`,
  },
} satisfies Record<string, ToolMessage>;

// widened view for lookups by dynamic (server-supplied) tool names
const toolMessagesByName: Record<string, ToolMessage | undefined> =
  TOOL_MESSAGES;
export const getToolMessage = (name: string) => toolMessagesByName[name];
