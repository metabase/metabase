import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupApiKeyEndpoints,
  setupGroupsEndpoint,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  act,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { PLUGIN_MONITOR, reinitialize } from "metabase/plugins";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import { registerVisualizations } from "metabase/visualizations/register";
import { AUDIT_DB_ID } from "metabase-enterprise/monitor/api-key-usage/constants";
import type {
  ApiKey,
  Database,
  Dataset,
  DatasetColumn,
  Field,
  RowValue,
} from "metabase-types/api";
import {
  createMockColumn,
  createMockDatabase,
  createMockDataset,
  createMockDatasetData,
  createMockField,
  createMockGroup,
  createMockTable,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

registerVisualizations();

const API_KEY_USAGE_TABLE_ID = 3001;
const GROUP_MEMBERS_TABLE_ID = 3002;

const BASE_TYPE = {
  text: "type/Text",
  integer: "type/Integer",
  dateTime: "type/DateTimeWithLocalTZ",
} as const;

type FieldSpec = [
  type: keyof typeof BASE_TYPE,
  name: string,
  semantic_type: Field["semantic_type"],
];

// Same columns as the `v_api_key_usage` view
// (resources/migrations/instance_analytics_views/api_key_usage).
const API_KEY_USAGE_FIELDS: FieldSpec[] = [
  ["integer", "log_id", "type/PK"],
  ["dateTime", "occurred_at", "type/CreationTimestamp"],
  ["text", "route_template", "type/Category"],
  ["text", "http_method", "type/Category"],
  ["integer", "status", "type/Category"],
  ["integer", "duration_ms", "type/Quantity"],
  ["integer", "api_key_id", "type/FK"],
  ["text", "api_key_name", "type/Name"],
  ["integer", "actor_user_id", "type/FK"],
  ["integer", "creator_id", "type/FK"],
  ["text", "creator_display_name", "type/Name"],
  ["text", "group_name", "type/Category"],
  ["text", "client_name", "type/Category"],
  ["text", "client_display_name", "type/Category"],
  ["text", "embedding_client", "type/Category"],
  ["text", "embedding_hostname", "type/Category"],
  ["text", "ip_address", "type/Category"],
  ["text", "user_agent", "type/Category"],
];

// Field ids are deterministic — `table_id * 100 + field index` (see `buildTable`).
const fieldId = (name: string) =>
  API_KEY_USAGE_TABLE_ID * 100 +
  API_KEY_USAGE_FIELDS.findIndex(([, fieldName]) => fieldName === name);
const fieldName = (id: number) =>
  API_KEY_USAGE_FIELDS[id - API_KEY_USAGE_TABLE_ID * 100]?.[1];
const API_KEY_ID_FIELD_ID = fieldId("api_key_id");
const OCCURRED_AT_FIELD_ID = fieldId("occurred_at");
const API_KEY_NAME_FIELD_ID = fieldId("api_key_name");
const CREATOR_DISPLAY_NAME_FIELD_ID = fieldId("creator_display_name");

const buildTable = (id: number, name: string, fields: FieldSpec[]) =>
  createMockTable({
    id,
    db_id: AUDIT_DB_ID,
    schema: "public",
    name,
    display_name: name,
    fields: fields.map(([type, fieldName, semantic_type], i) =>
      createMockField({
        id: id * 100 + i,
        table_id: id,
        name: fieldName,
        display_name: fieldName,
        fingerprint: null,
        base_type: BASE_TYPE[type],
        effective_type: BASE_TYPE[type],
        semantic_type,
      }),
    ),
  });

const auditDatabase: Database = createMockDatabase({
  id: AUDIT_DB_ID,
  name: "Audit DB",
  tables: [
    buildTable(API_KEY_USAGE_TABLE_ID, "v_api_key_usage", API_KEY_USAGE_FIELDS),
    buildTable(GROUP_MEMBERS_TABLE_ID, "v_group_members", [
      ["integer", "user_id", "type/Description"],
      ["integer", "group_id", "type/PK"],
      ["text", "group_name", "type/Name"],
    ]),
  ],
});

const ADMIN_GROUP = { id: 2, name: "Administrators" };
const ADMIN_USER_ID = 1;
const ADMIN_DISPLAY_NAME = "Bobby Tables";

const createApiKey = (id: number, name: string): ApiKey => ({
  id,
  name,
  group: ADMIN_GROUP,
  creator_id: ADMIN_USER_ID,
  masked_key: "mb_1234...",
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
  updated_by: { id: ADMIN_USER_ID, common_name: ADMIN_DISPLAY_NAME },
  last_used_at: null,
});

// The seeded key is not the first in the list, so a page that always picks the first key fails.
const OTHER_KEY = createApiKey(10, "other_unused_key");
const SEEDED_KEY = createApiKey(11, "e2e_seeded_key");
const UNUSED_KEY = createApiKey(12, "e2e_unused_key");

// MBQL 5 clauses as they arrive in the request body.
type MbqlClause = [string, Record<string, unknown>, ...unknown[]];
type MbqlStage = {
  filters?: MbqlClause[];
  aggregation?: MbqlClause[];
  breakout?: MbqlClause[];
  fields?: MbqlClause[];
  page?: { page: number; items: number };
};

const isFieldRef = (value: unknown, id: number) =>
  Array.isArray(value) && value[0] === "field" && value[2] === id;

/** The value of an `["=", {}, api_key_id, value]` filter on the stage, or undefined. */
function getApiKeyIdFilter(stage: MbqlStage): number | undefined {
  const clause = stage.filters?.find(
    ([operator, , field]) =>
      operator === "=" && isFieldRef(field, API_KEY_ID_FIELD_ID),
  );
  return clause ? Number(clause[3]) : undefined;
}

/** The `time-interval` filter on `occurred_at`, or undefined. */
function getOccurredAtInterval(stage: MbqlStage) {
  const clause = stage.filters?.find(
    ([operator, , field]) =>
      operator === "time-interval" && isFieldRef(field, OCCURRED_AT_FIELD_ID),
  );
  return clause
    ? {
        value: clause[3],
        unit: clause[4],
        includeCurrent: clause[1]["include-current"] === true,
      }
    : undefined;
}

/** The field ids the stage projects with `fields`. */
const getFieldIds = (stage: MbqlStage): number[] =>
  (stage.fields ?? []).map((ref) => Number(ref[2]));

const column = (name: string, source: DatasetColumn["source"] = "fields") =>
  createMockColumn({ name, display_name: name, source });

const dataset = (cols: DatasetColumn[], rows: RowValue[][]): Dataset =>
  createMockDataset({
    data: createMockDatasetData({ cols, rows }),
    database_id: AUDIT_DB_ID,
    row_count: rows.length,
    running_time: 1,
  });

// The seeded call, as a row of the view. Like the call the e2e test seeds, it happened today.
const SEEDED_CALL: Record<string, RowValue> = {
  log_id: 501,
  occurred_at: new Date().toISOString(),
  route_template: "/api/testing/api-keys/seed-usage",
  http_method: "GET",
  status: 200,
  duration_ms: 42,
  api_key_id: SEEDED_KEY.id,
  api_key_name: SEEDED_KEY.name,
  actor_user_id: 2,
  creator_id: ADMIN_USER_ID,
  creator_display_name: ADMIN_DISPLAY_NAME,
  group_name: ADMIN_GROUP.name,
  client_name: "curl",
  client_display_name: "curl",
  embedding_client: null,
  embedding_hostname: null,
  ip_address: null,
  user_agent: "curl/8.0.1",
};

/** Stage 0 of an `/api/dataset` request body. */
function parseFirstStage(body: string): MbqlStage {
  // JSON.parse returns `any`; the request body is an MBQL 5 query, so assert its shape.
  const query = JSON.parse(body) as { stages: MbqlStage[] };
  return query.stages[0];
}

/**
 * Stands in for the audit view: with `hasCalls`, it holds one call, made today with the seeded
 * key. Every query gets that call only when it isn't filtered to another API key and its date
 * range includes today, so a request that drops or mangles either filter shows the wrong rows.
 * The events query gets back only the columns it projects.
 */
function respondToDatasetQuery(body: string, hasCalls: boolean): Dataset {
  const stage = parseFirstStage(body);
  const apiKeyId = getApiKeyIdFilter(stage);
  const matchesSeededCall =
    hasCalls &&
    (apiKeyId == null || apiKeyId === SEEDED_KEY.id) &&
    getOccurredAtInterval(stage)?.includeCurrent === true;

  if (stage.page != null) {
    const names = getFieldIds(stage)
      .map(fieldName)
      .filter((name): name is string => name != null);
    return dataset(
      names.map((name) => column(name)),
      matchesSeededCall ? [names.map((name) => SEEDED_CALL[name])] : [],
    );
  }
  if (stage.breakout?.some((ref) => isFieldRef(ref, API_KEY_ID_FIELD_ID))) {
    return dataset(
      [column("api_key_id", "breakout"), column("max", "aggregation")],
      matchesSeededCall ? [[SEEDED_KEY.id, SEEDED_CALL.occurred_at]] : [],
    );
  }
  if (stage.breakout == null || stage.breakout.length === 0) {
    return dataset(
      [column("count", "aggregation")],
      [[matchesSeededCall ? 1 : 0]],
    );
  }
  return dataset(
    [column("count", "aggregation"), column("dimension", "breakout")],
    matchesSeededCall ? [[1, "curl"]] : [],
  );
}

function setupEndpoints({
  apiKeys,
  hasCalls,
}: {
  apiKeys: ApiKey[];
  hasCalls: boolean;
}) {
  fetchMock.get(`path:/api/database/${AUDIT_DB_ID}/metadata`, auditDatabase);
  fetchMock.post("path:/api/dataset/query_metadata", {
    databases: [auditDatabase],
    tables: auditDatabase.tables ?? [],
    fields: (auditDatabase.tables ?? []).flatMap((table) => table.fields ?? []),
  });
  setupUsersEndpoints([
    createMockUser({
      id: ADMIN_USER_ID,
      first_name: "Bobby",
      last_name: "Tables",
    }),
  ]);
  setupGroupsEndpoint([
    createMockGroup({ id: 1, name: "All Users" }),
    createMockGroup(ADMIN_GROUP),
  ]);
  setupApiKeyEndpoints(apiKeys);
  fetchMock.post(
    "path:/api/dataset",
    ({ options }) => respondToDatasetQuery(String(options.body), hasCalls),
    { name: "dataset" },
  );
}

/** Stage 0 of every `/api/dataset` request so far. */
const datasetStages = (): MbqlStage[] =>
  fetchMock.callHistory
    .calls("dataset")
    .map((call) => parseFirstStage(String(call.options.body)));

const eventsStages = () => datasetStages().filter((stage) => stage.page);

function setup({
  apiKeys = [OTHER_KEY, SEEDED_KEY, UNUSED_KEY],
  hasCalls = true,
  initialRoute = Urls.monitorApiKeyUsage(),
}: { apiKeys?: ApiKey[]; hasCalls?: boolean; initialRoute?: string } = {}) {
  // TreeTable virtualizes rows from DOM measurements; jsdom needs a stubbed rect.
  mockGetBoundingClientRect({ width: 100, height: 100 });
  setupEndpoints({ apiKeys, hasCalls });

  const state = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures({ audit_app: true }),
    }),
  });
  // The plugin reads the token features from the settings, so set them up before it initializes.
  setupEnterprisePlugins();

  return renderWithProviders(
    <Route path={Urls.monitorApiKeyUsage()}>
      {PLUGIN_MONITOR.getApiKeyUsageRoutes()}
    </Route>,
    { initialRoute, withRouter: true, storeInitialState: state },
  );
}

async function selectApiKey(label: string) {
  await userEvent.click(screen.getByTestId("api-key-usage-filter-select"));
  await userEvent.click(await screen.findByRole("option", { name: label }));
}

/**
 * Wait until every request has its response and the store has handled it, so a negative check
 * sees the loaded page. RTK Query handles a response a few promise steps after fetch resolves, so
 * wait one macrotask after the flush.
 */
const settleRequests = () =>
  act(async () => {
    await fetchMock.callHistory.flush(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

const keyActivityTable = () => screen.findByTestId("api-key-activity-table");

async function eventsTable() {
  const table = await screen.findByTestId("api-key-usage-events-table");
  await waitFor(() => expect(table).toHaveAttribute("aria-busy", "false"));
  return table;
}

describe("ApiKeyUsageSectionLayout", () => {
  afterEach(() => {
    reinitialize();
  });

  it("shows the Key activity table for the keys in the list", async () => {
    setup();

    expect(
      await screen.findByRole("heading", { name: "API key usage" }),
    ).toBeInTheDocument();
    const table = await keyActivityTable();
    expect(await within(table).findByText(SEEDED_KEY.name)).toBeInTheDocument();
    expect(within(table).getByText(UNUSED_KEY.name)).toBeInTheDocument();
    await settleRequests();
    expect(screen.queryByText("No API key activity")).not.toBeInTheDocument();
  });

  it("shows the page empty state when there are no API keys and no calls", async () => {
    setup({ apiKeys: [], hasCalls: false });

    expect(await screen.findByText("No API key activity")).toBeInTheDocument();
    expect(
      screen.queryByTestId("api-key-activity-table"),
    ).not.toBeInTheDocument();
  });

  it("scopes the Key activity table to the selected API key, and keeps a key with no calls", async () => {
    setup();
    const table = await keyActivityTable();
    await within(table).findByText(SEEDED_KEY.name);

    await selectApiKey(UNUSED_KEY.name);

    await waitFor(() =>
      expect(
        within(table).queryByText(SEEDED_KEY.name),
      ).not.toBeInTheDocument(),
    );
    expect(within(table).getByText(UNUSED_KEY.name)).toBeInTheDocument();
    expect(within(table).queryByText(OTHER_KEY.name)).not.toBeInTheDocument();
    // The key has no calls (the count query returns 0), but the page still shows its row.
    await waitFor(() =>
      expect(getApiKeyIdFilter(datasetStages().at(-1) ?? {})).toBe(
        UNUSED_KEY.id,
      ),
    );
    await settleRequests();
    expect(screen.queryByText("No API key activity")).not.toBeInTheDocument();

    await selectApiKey("All API keys");

    expect(await within(table).findByText(SEEDED_KEY.name)).toBeInTheDocument();
    expect(within(table).getByText(OTHER_KEY.name)).toBeInTheDocument();
  });

  it("shows the seeded call on the Events tab, attributed to its creator", async () => {
    const { router } = setup();

    await userEvent.click(await screen.findByRole("link", { name: "Events" }));

    expect(router?.location.pathname).toBe(Urls.monitorApiKeyUsageEvents());
    const table = await eventsTable();
    // The events query projects the key and creator columns; the mock returns only those it asks for.
    expect(getFieldIds(eventsStages().at(-1) ?? {})).toEqual(
      expect.arrayContaining([
        API_KEY_NAME_FIELD_ID,
        CREATOR_DISPLAY_NAME_FIELD_ID,
      ]),
    );
    expect(
      within(table).getByRole("columnheader", { name: "Created by" }),
    ).toBeInTheDocument();
    expect(within(table).getByText(SEEDED_KEY.name)).toBeInTheDocument();
    expect(within(table).getByText(ADMIN_DISPLAY_NAME)).toBeInTheDocument();
  });

  it("has a group filter but no user filter", async () => {
    setup({ initialRoute: Urls.monitorApiKeyUsageEvents() });

    await eventsTable();
    expect(
      screen.getByTestId("conversation-filters-group-select"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("conversation-filters-user-select"),
    ).not.toBeInTheDocument();
  });

  it("sends the API key filter with the events query, and shows the table's empty state for a key with no calls", async () => {
    setup({ initialRoute: Urls.monitorApiKeyUsageEvents() });
    const table = await eventsTable();
    expect(within(table).getByText(SEEDED_KEY.name)).toBeInTheDocument();
    expect(getApiKeyIdFilter(eventsStages().at(-1) ?? {})).toBeUndefined();

    await selectApiKey(SEEDED_KEY.name);
    await waitFor(() =>
      expect(getApiKeyIdFilter(eventsStages().at(-1) ?? {})).toBe(
        SEEDED_KEY.id,
      ),
    );
    expect(await within(table).findByText(SEEDED_KEY.name)).toBeInTheDocument();

    await selectApiKey(UNUSED_KEY.name);
    await waitFor(() =>
      expect(getApiKeyIdFilter(eventsStages().at(-1) ?? {})).toBe(
        UNUSED_KEY.id,
      ),
    );
    expect(
      await within(table).findByText("No calls found"),
    ).toBeInTheDocument();
    expect(within(table).queryByText(SEEDED_KEY.name)).not.toBeInTheDocument();
    await settleRequests();
    expect(screen.queryByText("No API key activity")).not.toBeInTheDocument();

    await selectApiKey("All API keys");
    await waitFor(() =>
      expect(getApiKeyIdFilter(eventsStages().at(-1) ?? {})).toBeUndefined(),
    );
    expect(await within(table).findByText(SEEDED_KEY.name)).toBeInTheDocument();
  });

  it("sends the selected date range with the events query", async () => {
    setup({ initialRoute: Urls.monitorApiKeyUsageEvents() });
    const table = await eventsTable();
    // The default range is the last 30 days, including today.
    expect(getOccurredAtInterval(eventsStages().at(-1) ?? {})).toEqual({
      value: -29,
      unit: "day",
      includeCurrent: true,
    });

    await userEvent.click(
      screen.getByTestId("conversation-filters-date-select"),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Last 7 days" }),
    );

    await waitFor(() =>
      expect(getOccurredAtInterval(eventsStages().at(-1) ?? {})).toEqual({
        value: -6,
        unit: "day",
        includeCurrent: true,
      }),
    );
    expect(await within(table).findByText(SEEDED_KEY.name)).toBeInTheDocument();
  });
});
