import { t } from "ttag";

let i = 0;

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

export const METABOT_ERR_MSG = {
  get default() {
    return t`Sorry, I ran into an error. Could you please try that again?`;
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
    return t`Inspecting some data`;
  },
  get search_data_sources() {
    return t`Checking available data sources`;
  },
  get create_research_plan() {
    return t`Creating a plan`;
  },
  get search() {
    const values = [
      t`Boiling the ocean`,
      t`Searching far and wide`,
      t`Digging into something`,
      t`Ooooooh what's this I see???`,
    ];

    const result = values[i % values.length] ?? t`Searching`;
    i++;
    return result;
  },
  get search_metabase_documentation() {
    return t`Consulting the docs`;
  },
  get create_sql_query() {
    const values = [
      t`My life for Aiur!`,
      t`Forcing tables to JOIN`,
      t`Constructing additional pylons`,
    ];

    const result = values[i % values.length] ?? t`Creating a query`;
    i++;
    return result;
  },
  get execute_query() {
    const values = [
      t`Spawn more overlords`,
      t`You require more vespene gas`,
      t`Power overwhelming`,
    ];

    const result = values[i % values.length] ?? t`Executing query`;
    i++;
    return result;
  },
};
