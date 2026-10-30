import userEvent from "@testing-library/user-event";
import fetchMock, { type CallLog } from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupAdhocQueryEndpoint,
  setupAdhocQueryMetadataEndpoint,
  setupApiKeyEndpoints,
  setupDatabaseMetadataEndpoint,
  setupDatabaseMetadataErrorEndpoint,
  setupFieldEndpoints,
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
import { fieldApi } from "metabase/api";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import { defer } from "metabase/utils/promise";
import { CliAnalyticsSectionLayout } from "metabase-enterprise/monitor/ai-auditing/cli-analytics/components/CliAnalyticsSectionLayout";
import { CliCallsPage } from "metabase-enterprise/monitor/ai-auditing/cli-analytics/components/CliCallsPage";
import { McpAnalyticsSectionLayout } from "metabase-enterprise/monitor/ai-auditing/mcp-analytics/components/McpAnalyticsSectionLayout";
import { McpEventsPage } from "metabase-enterprise/monitor/ai-auditing/mcp-analytics/components/McpEventsPage";
import { AUDIT_DB_ID } from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/constants";
import { ApiKeyUsageEventsPage } from "metabase-enterprise/monitor/api-key-usage/components/ApiKeyUsageEventsPage";
import { ApiKeyUsageSectionLayout } from "metabase-enterprise/monitor/api-key-usage/components/ApiKeyUsageSectionLayout";
import type { Dataset, Field, Table } from "metabase-types/api";
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

const SECTIONS = [
  {
    label: "Calls",
    tableName: "v_agent_api_calls",
    idColumn: "call_id",
    dateColumn: "created_at",
    displayColumn: "operation",
    eventsPath: Urls.monitorAiAuditingCliCalls(),
    usagePath: Urls.monitorAiAuditingCliUsage(),
    layout: <CliAnalyticsSectionLayout />,
    page: <CliCallsPage />,
  },
  {
    label: "Tool calls",
    tableName: "v_mcp_tool_calls",
    idColumn: "tool_call_id",
    dateColumn: "created_at",
    displayColumn: "tool_name",
    eventsPath: Urls.monitorAiAuditingMcpEvents(),
    usagePath: Urls.monitorAiAuditingMcpUsage(),
    layout: <McpAnalyticsSectionLayout />,
    page: <McpEventsPage />,
  },
  {
    label: "Events",
    tableName: "v_api_key_usage",
    idColumn: "log_id",
    dateColumn: "occurred_at",
    displayColumn: "route_template",
    eventsPath: Urls.monitorApiKeyUsageEvents(),
    usagePath: Urls.monitorApiKeyUsageOverview(),
    layout: <ApiKeyUsageSectionLayout />,
    page: <ApiKeyUsageEventsPage />,
  },
];

type Section = (typeof SECTIONS)[number];
const [CLI_SECTION] = SECTIONS;
const EVENTS_TABLE_ID = 2001;
const GROUP_MEMBERS_TABLE_ID = 2002;
const DATE_FIELD_ID = EVENTS_TABLE_ID * 100 + 1;
const FILTERED_ROUTE_SEARCH =
  "?date=past7days~&user=1&group=2&api_key=9&page=2";

function buildTable(id: number, name: string, fields: Partial<Field>[]): Table {
  return createMockTable({
    id,
    db_id: AUDIT_DB_ID,
    name,
    fields: fields.map((field, index) =>
      createMockField({
        id: id * 100 + index,
        table_id: id,
        display_name: field.name,
        fingerprint: null,
        base_type: "type/Text",
        effective_type: "type/Text",
        ...field,
      }),
    ),
  });
}

function countDataset(count: number): Dataset {
  return createMockDataset({
    database_id: AUDIT_DB_ID,
    row_count: 1,
    data: createMockDatasetData({
      rows: [[count]],
      cols: [createMockColumn({ name: "count", source: "aggregation" })],
    }),
  });
}

function requestBody(call: CallLog | undefined): unknown {
  return typeof call?.options?.body === "string"
    ? JSON.parse(call.options.body)
    : null;
}

function requestStage(call: CallLog | undefined): unknown {
  const body = requestBody(call);
  if (body === null || typeof body !== "object") {
    return null;
  }
  if ("query" in body) {
    return body.query;
  }
  if (!("stages" in body) || !Array.isArray(body.stages)) {
    return null;
  }
  const stages: unknown[] = body.stages;
  return stages[0];
}

function isCounterQuery(call: CallLog): boolean {
  const body = requestBody(call);
  return body !== null && typeof body === "object" && "query" in body;
}

function countCalls() {
  return fetchMock.callHistory.calls("audit-row-count");
}

// TreeTable briefly renders cell text in hidden column-measuring nodes, so wait
// for the rendered row rather than the first matching text.
function findEventRow() {
  return screen.findByRole("row", { name: /Visible event/ });
}

function getTab(section: Section) {
  return screen.getByRole("link", { name: section.label });
}

interface SetupOpts {
  section?: Section;
  getCountResponse?: () => Dataset | Response | Promise<Dataset | Response>;
  missingView?: boolean;
  metadataError?: boolean;
  initialRoute?: string;
  tableTotal?: number;
  getEventsResponse?: () => Dataset | Promise<Dataset>;
}

function setup({
  section = CLI_SECTION,
  getCountResponse = () => countDataset(137),
  missingView = false,
  metadataError = false,
  initialRoute = `${section.eventsPath}${FILTERED_ROUTE_SEARCH}`,
  tableTotal = 3,
  getEventsResponse,
}: SetupOpts = {}) {
  setupEnterprisePlugins();
  mockGetBoundingClientRect({ width: 100, height: 100 });
  const database = createMockDatabase({
    id: AUDIT_DB_ID,
    tables: missingView
      ? []
      : [
          buildTable(EVENTS_TABLE_ID, section.tableName, [
            { name: section.idColumn, semantic_type: "type/PK" },
            {
              name: section.dateColumn,
              base_type: "type/DateTimeWithLocalTZ",
              effective_type: "type/DateTimeWithLocalTZ",
              semantic_type: "type/CreationTimestamp",
            },
            { name: section.displayColumn },
            { name: "status" },
            ...[
              "user_id",
              "tenant_id",
              "api_key_id",
              "creator_id",
              "actor_user_id",
            ].map((name) => ({
              name,
              base_type: "type/Integer" as const,
              effective_type: "type/Integer" as const,
            })),
          ]),
          buildTable(GROUP_MEMBERS_TABLE_ID, "v_group_members", [
            {
              name: "user_id",
              base_type: "type/Integer",
              effective_type: "type/Integer",
            },
            {
              name: "group_id",
              base_type: "type/Integer",
              effective_type: "type/Integer",
            },
            { name: "group_name" },
          ]),
        ],
  });
  if (metadataError) {
    setupDatabaseMetadataErrorEndpoint(AUDIT_DB_ID);
  } else {
    setupDatabaseMetadataEndpoint(database);
  }
  setupAdhocQueryMetadataEndpoint({
    databases: [database],
    tables: database.tables ?? [],
    fields: database.tables?.flatMap((table) => table.fields ?? []) ?? [],
  });
  setupUsersEndpoints([createMockUser({ id: 1 })]);
  setupGroupsEndpoint([createMockGroup({ id: 1 }), createMockGroup({ id: 2 })]);
  setupApiKeyEndpoints([]);
  setupAdhocQueryEndpoint(getCountResponse, {
    name: "audit-row-count",
    matcherFunction: isCounterQuery,
  });
  const filteredDataset = createMockDataset({
    database_id: AUDIT_DB_ID,
    row_count: 1,
    data: createMockDatasetData({
      rows: [[tableTotal, "Visible event"]],
      cols: [
        createMockColumn({ name: "count", source: "aggregation" }),
        createMockColumn({ name: section.displayColumn, source: "fields" }),
      ],
    }),
  });
  setupAdhocQueryEndpoint(
    (call) => {
      const stage = requestStage(call);
      const isRowPage =
        stage !== null && typeof stage === "object" && "page" in stage;
      return getEventsResponse && isRowPage
        ? getEventsResponse()
        : filteredDataset;
    },
    { name: "filtered-dataset" },
  );

  return renderWithProviders(
    <>
      <Route element={section.layout}>
        <Route path={section.eventsPath} element={section.page} />
        <Route path={section.usagePath} element={<div />} />
      </Route>
      <Route path="/outside" element={<div>Outside analytics</div>} />
    </>,
    {
      withRouter: true,
      initialRoute,
      storeInitialState: createMockState({
        settings: mockSettings({
          "token-features": createMockTokenFeatures({ audit_app: true }),
        }),
      }),
    },
  );
}

describe.each(SECTIONS)("$label tab count", (section) => {
  it("counts the default 30-day population, ignoring optional filters", async () => {
    setup({ section });

    expect(await within(getTab(section)).findByText("137")).toBeVisible();
    expect(
      within(screen.getByRole("link", { name: "Usage" })).queryByText("137"),
    ).not.toBeInTheDocument();
    expect(await findEventRow()).toBeVisible();
    expect(countCalls()).toHaveLength(1);
    const stage = requestStage(countCalls()[0]);
    expect(stage).toEqual(
      expect.objectContaining({
        "source-table": EVENTS_TABLE_ID,
        aggregation: [["count"]],
        filter: [
          "time-interval",
          ["field", DATE_FIELD_ID, expect.anything()],
          -29,
          "day",
          { "include-current": true },
        ],
      }),
    );
    for (const key of ["joins", "page", "limit", "breakout", "order-by"]) {
      expect(stage).not.toHaveProperty(key);
    }
  });

  it("matches the unfiltered table's date window and total", async () => {
    setup({ section, initialRoute: section.eventsPath, tableTotal: 137 });

    expect(await within(getTab(section)).findByText("137")).toBeVisible();
    expect(await screen.findByTestId("pagination-total")).toHaveTextContent(
      "137",
    );
    const totalStage = fetchMock.callHistory
      .calls("filtered-dataset")
      .map(requestStage)
      .find(
        (stage) =>
          stage !== null &&
          typeof stage === "object" &&
          "aggregation" in stage &&
          !("page" in stage),
      );
    expect(totalStage).toEqual(
      expect.objectContaining({
        "source-table": EVENTS_TABLE_ID,
        filters: [
          [
            "time-interval",
            expect.objectContaining({ "include-current": true }),
            ["field", expect.anything(), DATE_FIELD_ID],
            -29,
            "day",
          ],
        ],
      }),
    );
    expect(totalStage).not.toHaveProperty("joins");
  });
});

describe("audit tab count freshness and failures", () => {
  it("shows 0 when a successful count returns no rows", async () => {
    setup({
      getCountResponse: () =>
        createMockDataset({
          database_id: AUDIT_DB_ID,
          row_count: 0,
          data: createMockDatasetData({
            rows: [],
            cols: [createMockColumn({ name: "count", source: "aggregation" })],
          }),
        }),
    });
    expect(await within(getTab(CLI_SECTION)).findByText("0")).toBeVisible();
  });

  it("shows a zero count rather than hiding it", async () => {
    setup({ getCountResponse: () => countDataset(0) });
    expect(await within(getTab(CLI_SECTION)).findByText("0")).toBeVisible();
    expect(
      within(getTab(CLI_SECTION)).queryByTestId("tab-count-skeleton"),
    ).not.toBeInTheDocument();
  });

  it("keeps the table and navigation usable while the count is pending", async () => {
    const pending = defer<Dataset>();
    setup({ getCountResponse: () => pending.promise });
    expect(await findEventRow()).toBeVisible();
    await userEvent.click(screen.getByRole("link", { name: "Usage" }));
    expect(screen.getByRole("link", { name: "Usage" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await act(async () => pending.resolve(countDataset(137)));
    expect(await within(getTab(CLI_SECTION)).findByText("137")).toBeVisible();
  });

  it("does not refetch for optional filters or pages, but refreshes on section entry", async () => {
    let count = 137;
    const { router } = setup({ getCountResponse: () => countDataset(count) });
    expect(await within(getTab(CLI_SECTION)).findByText("137")).toBeVisible();

    act(() =>
      router?.navigate(
        `${CLI_SECTION.eventsPath}?date=past30days~&user=1&group=2&page=3`,
      ),
    );
    await waitFor(() =>
      expect(
        fetchMock.callHistory.calls("filtered-dataset").map(requestStage),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            page: expect.objectContaining({ page: 4 }),
          }),
        ]),
      ),
    );
    expect(countCalls()).toHaveLength(1);

    act(() => router?.navigate("/outside"));
    await screen.findByText("Outside analytics");
    count = 139;
    act(() => router?.navigate(CLI_SECTION.eventsPath));
    expect(await within(getTab(CLI_SECTION)).findByText("139")).toBeVisible();
    expect(countCalls()).toHaveLength(2);
  });

  it("refreshes after an audit metadata mutation invalidates ad-hoc datasets", async () => {
    const pending = defer<Dataset>();
    let calls = 0;
    const { store } = setup({
      getCountResponse: () =>
        ++calls === 1 ? countDataset(137) : pending.promise,
    });
    setupFieldEndpoints(createMockField({ id: EVENTS_TABLE_ID * 100 }));
    expect(await within(getTab(CLI_SECTION)).findByText("137")).toBeVisible();
    await act(async () => {
      await store
        .dispatch(
          fieldApi.endpoints.updateField.initiate({
            id: EVENTS_TABLE_ID * 100,
            description: "Audit event identifier",
          }),
        )
        .unwrap();
    });
    await waitFor(() => expect(countCalls()).toHaveLength(2));
    expect(within(getTab(CLI_SECTION)).getByText("137")).toBeVisible();
    await act(async () => pending.resolve(countDataset(138)));
    expect(await within(getTab(CLI_SECTION)).findByText("138")).toBeVisible();
  });

  it.each([
    { name: "negative scalar", response: countDataset(-1) },
    {
      name: "failed dataset",
      response: createMockDataset({
        ...countDataset(137),
        error: "Query failed",
        status: "failed",
      }),
    },
    { name: "HTTP error", response: new Response(null, { status: 500 }) },
  ])("hides a $name count without blocking the table", async ({ response }) => {
    setup({ getCountResponse: () => response });
    expect(await findEventRow()).toBeVisible();
    await waitFor(() => expect(countCalls()).toHaveLength(1));
    await waitFor(() =>
      expect(
        within(getTab(CLI_SECTION)).queryByTestId("tab-count-skeleton"),
      ).not.toBeInTheDocument(),
    );
    expect(getTab(CLI_SECTION)).toHaveTextContent(/^Calls$/);
  });

  it.each([{ missingView: true }, { metadataError: true }])(
    "hides the count without querying when audit metadata is unavailable: %j",
    async (options) => {
      setup(options);
      await waitFor(() =>
        expect(
          fetchMock.callHistory.called(`database-${AUDIT_DB_ID}-metadata`),
        ).toBe(true),
      );
      await waitFor(() =>
        expect(
          within(getTab(CLI_SECTION)).queryByTestId("tab-count-skeleton"),
        ).not.toBeInTheDocument(),
      );
      expect(getTab(CLI_SECTION)).toHaveTextContent(/^Calls$/);
      expect(countCalls()).toHaveLength(0);
    },
  );
});

// Audit tables load rows through ad-hoc dataset queries rather than an RTK list
// endpoint, so the CLI Calls grid covers that loading path for all three.
describe("CLI Calls grid loading", () => {
  it("shows a skeleton only initially and keeps rows under the loader while paging", async () => {
    const initial = defer<Dataset>();
    const pending = defer<Dataset>();
    const page = (name: string) =>
      createMockDataset({
        data: createMockDatasetData({
          rows: [[name]],
          cols: [createMockColumn({ name: CLI_SECTION.displayColumn })],
        }),
      });
    let requests = 0;
    setup({
      initialRoute: CLI_SECTION.eventsPath,
      tableTotal: 26,
      getEventsResponse: () =>
        ++requests === 1 ? initial.promise : pending.promise,
    });
    expect(await screen.findByTestId("tree-table-skeleton")).toBeVisible();
    expect(screen.queryByRole("treegrid")).not.toBeInTheDocument();
    await act(async () => initial.resolve(page("First event")));
    await screen.findByText("First event");
    await userEvent.click(screen.getByLabelText("Next page"));
    await waitFor(() => expect(requests).toBe(2));
    expect(screen.getByText("First event")).toBeVisible();
    expect(screen.getByTestId("loading-overlay")).toBeVisible();
    expect(screen.queryByTestId("tree-table-skeleton")).not.toBeInTheDocument();
    expect(screen.getByTestId("pagination-total")).toHaveTextContent("26");
    await act(async () => pending.resolve(page("Next event")));
    expect(await screen.findByText("Next event")).toBeVisible();
    expect(screen.queryByText("First event")).not.toBeInTheDocument();
  });
});
