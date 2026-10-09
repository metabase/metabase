import userEvent from "@testing-library/user-event";
import fetchMock, { type CallLog } from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupAdhocQueryEndpoint,
  setupAdhocQueryMetadataEndpoint,
  setupApiKeyEndpoints,
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
const EVENTS_TABLE_ID = 2001;
const GROUP_MEMBERS_TABLE_ID = 2002;

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
  const body: unknown =
    typeof call?.options?.body === "string"
      ? JSON.parse(call.options.body)
      : null;
  return body;
}

function requestStage(call: CallLog | undefined): unknown {
  const body = requestBody(call);
  if (body === null || typeof body !== "object") {
    return null;
  }
  if ("query" in body) {
    return body.query;
  }
  if (!("stages" in body)) {
    return null;
  }
  const stages: unknown = body.stages;
  if (!Array.isArray(stages)) {
    return null;
  }
  const entries: unknown[] = stages;
  return entries[0];
}

function isCounterQuery(call: CallLog): boolean {
  const body = requestBody(call);
  return body !== null && typeof body === "object" && "query" in body;
}

interface SetupOpts {
  section: Section;
  getCountResponse?: () => Dataset | Response | Promise<Dataset | Response>;
  count?: number;
  missingView?: boolean;
  metadataError?: boolean;
  initialRoute?: string;
  tableTotal?: number;
}

function setup({
  section,
  getCountResponse,
  count = 137,
  missingView = false,
  metadataError = false,
  initialRoute = `${section.eventsPath}?date=past7days~&user=1&group=2&api_key=9&page=2`,
  tableTotal = 3,
}: SetupOpts) {
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
              base_type: "type/Integer",
              effective_type: "type/Integer",
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
  fetchMock.get(
    `path:/api/database/${AUDIT_DB_ID}/metadata`,
    metadataError ? { status: 500 } : database,
  );
  setupAdhocQueryMetadataEndpoint({
    databases: [database],
    tables: database.tables ?? [],
    fields: database.tables?.flatMap((table) => table.fields ?? []) ?? [],
  });
  setupUsersEndpoints([createMockUser({ id: 1 })]);
  setupGroupsEndpoint([createMockGroup({ id: 1 }), createMockGroup({ id: 2 })]);
  setupApiKeyEndpoints([]);
  setupAdhocQueryEndpoint(getCountResponse ?? countDataset(count), {
    name: "audit-row-count",
    matcherFunction: isCounterQuery,
  });
  setupAdhocQueryEndpoint(
    createMockDataset({
      database_id: AUDIT_DB_ID,
      row_count: 1,
      data: createMockDatasetData({
        rows: [[tableTotal, "Visible event"]],
        cols: [
          createMockColumn({ name: "count", source: "aggregation" }),
          createMockColumn({ name: section.displayColumn, source: "fields" }),
        ],
      }),
    }),
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
  it.each([137, 0])(
    "shows the default 30-day row total %i, not the optionally filtered page total",
    async (count) => {
      setup({ section, count });
      const tab = screen.getByRole("link", { name: section.label });
      expect(await within(tab).findByText(String(count))).toBeInTheDocument();
      expect(
        within(screen.getByRole("link", { name: "Usage" })).queryByText(
          String(count),
        ),
      ).not.toBeInTheDocument();
      expect(fetchMock.callHistory.calls("audit-row-count")).toHaveLength(1);
      const stage = requestStage(
        fetchMock.callHistory.calls("audit-row-count")[0],
      );
      expect(stage).toEqual(
        expect.objectContaining({
          "source-table": EVENTS_TABLE_ID,
          aggregation: [["count"]],
          filter: [
            "time-interval",
            ["field", EVENTS_TABLE_ID * 100 + 1, expect.anything()],
            -29,
            "day",
            { "include-current": true },
          ],
        }),
      );
      for (const key of [
        "filters",
        "joins",
        "page",
        "limit",
        "breakout",
        "order-by",
      ]) {
        expect(stage).not.toHaveProperty(key);
      }
      expect(await screen.findByText("Visible event")).toBeInTheDocument();
      expect(
        fetchMock.callHistory.calls("filtered-dataset").some((call) => {
          const stage = requestStage(call);
          return stage !== null && typeof stage === "object" && "page" in stage;
        }),
      ).toBe(true);
    },
  );

  it("matches the default pagination date window without adding scope joins", async () => {
    setup({
      section,
      initialRoute: section.eventsPath,
      count: 137,
      tableTotal: 137,
    });
    expect(
      await within(
        screen.getByRole("link", { name: section.label }),
      ).findByText("137"),
    ).toBeInTheDocument();
    expect(await screen.findByTestId("pagination-total")).toHaveTextContent(
      "137",
    );
    const paginationStage = fetchMock.callHistory
      .calls("filtered-dataset")
      .map(requestStage)
      .find(
        (stage) =>
          stage !== null &&
          typeof stage === "object" &&
          "aggregation" in stage &&
          !("page" in stage) &&
          "filters" in stage &&
          Array.isArray(stage.filters) &&
          stage.filters.length === 1,
      );
    expect(paginationStage).toEqual(
      expect.objectContaining({
        "source-table": EVENTS_TABLE_ID,
        filters: [
          [
            "time-interval",
            expect.objectContaining({ "include-current": true }),
            ["field", expect.anything(), EVENTS_TABLE_ID * 100 + 1],
            -29,
            "day",
          ],
        ],
      }),
    );
    expect(paginationStage).not.toHaveProperty("joins");
    expect(fetchMock.callHistory.calls("audit-row-count")).toHaveLength(1);
  });

  it("keeps the table and navigation usable while the badge is pending", async () => {
    const pending = defer<Dataset>();
    setup({ section, getCountResponse: () => pending.promise });
    try {
      expect(
        await screen.findByTestId("tab-count-skeleton"),
      ).toBeInTheDocument();
      expect(await screen.findByText("Visible event")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("link", { name: "Usage" }));
      expect(screen.getByRole("link", { name: "Usage" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      expect(screen.getByRole("link", { name: section.label })).toHaveAttribute(
        "href",
        expect.stringContaining("page=2"),
      );
      pending.resolve(countDataset(137));
      expect(await screen.findByText("137")).toBeInTheDocument();
    } finally {
      pending.resolve(countDataset(137));
    }
  });

  it("does not refetch for optional filters or page changes, but refreshes on section entry", async () => {
    let count = 137;
    const { router } = setup({
      section,
      getCountResponse: () => countDataset(count),
    });
    expect(await screen.findByText("137")).toBeInTheDocument();
    act(() =>
      router?.navigate(
        `${section.eventsPath}?date=past30days~&user=1&group=2&api_key=4&page=3`,
      ),
    );
    await waitFor(() =>
      expect(
        fetchMock.callHistory.calls("filtered-dataset").map(requestStage),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ page: { page: 4, items: 25 } }),
        ]),
      ),
    );
    expect(fetchMock.callHistory.calls("audit-row-count")).toHaveLength(1);

    act(() => router?.navigate("/outside"));
    await screen.findByText("Outside analytics");
    count = 139;
    act(() => router?.navigate(section.eventsPath));
    expect(await screen.findByText("139")).toBeInTheDocument();
    expect(fetchMock.callHistory.calls("audit-row-count")).toHaveLength(2);
  });

  it("retains the known count during an audit dataset mutation refresh", async () => {
    const pending = defer<Dataset>();
    let calls = 0;
    const { store } = setup({
      section,
      getCountResponse: () =>
        ++calls === 1 ? countDataset(137) : pending.promise,
    });
    setupFieldEndpoints(createMockField({ id: EVENTS_TABLE_ID * 100 }));
    try {
      expect(await screen.findByText("137")).toBeInTheDocument();
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
      await waitFor(() =>
        expect(fetchMock.callHistory.calls("audit-row-count")).toHaveLength(2),
      );
      expect(screen.getByText("137")).toBeInTheDocument();
      expect(
        screen.queryByTestId("tab-count-skeleton"),
      ).not.toBeInTheDocument();
      pending.resolve(countDataset(138));
      expect(await screen.findByText("138")).toBeInTheDocument();
    } finally {
      pending.resolve(countDataset(138));
    }
  });

  it.each([
    {
      name: "missing scalar",
      dataset: createMockDataset({ data: createMockDatasetData({ rows: [] }) }),
    },
    { name: "negative scalar", dataset: countDataset(-1) },
    {
      name: "failed dataset",
      dataset: createMockDataset({
        ...countDataset(137),
        error: "Query failed",
        status: "failed",
      }),
    },
  ])("hides a $name rather than inventing a count", async ({ dataset }) => {
    setup({ section, getCountResponse: () => dataset });
    expect(screen.getByTestId("tab-count-skeleton")).toBeInTheDocument();
    expect(await screen.findByText("Visible event")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByTestId("tab-count-skeleton"),
      ).not.toBeInTheDocument(),
    );
    const tab = screen.getByRole("link", { name: section.label });
    expect(tab).toHaveTextContent(section.label);
    expect(within(tab).queryByText("0")).not.toBeInTheDocument();
    expect(within(tab).queryByText("137")).not.toBeInTheDocument();
  });

  it("hides a failed count without blocking the filtered table", async () => {
    setup({
      section,
      getCountResponse: () => new Response(null, { status: 500 }),
    });
    expect(screen.getByTestId("tab-count-skeleton")).toBeInTheDocument();
    expect(await screen.findByText("Visible event")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByTestId("tab-count-skeleton"),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("link", { name: section.label })).toHaveTextContent(
      section.label,
    );
    expect(
      within(screen.getByRole("link", { name: section.label })).queryByText(
        "0",
      ),
    ).not.toBeInTheDocument();
  });

  it.each([{ missingView: true }, { metadataError: true }])(
    "does not spin or invent zero when audit metadata is unavailable: %j",
    async (options) => {
      setup({ section, ...options });
      expect(screen.getByTestId("tab-count-skeleton")).toBeInTheDocument();
      await waitFor(() =>
        expect(
          fetchMock.callHistory.called(
            `path:/api/database/${AUDIT_DB_ID}/metadata`,
          ),
        ).toBe(true),
      );
      await waitFor(() =>
        expect(
          screen.queryByTestId("tab-count-skeleton"),
        ).not.toBeInTheDocument(),
      );
      expect(
        within(screen.getByRole("link", { name: section.label })).queryByText(
          "0",
        ),
      ).not.toBeInTheDocument();
      expect(fetchMock.callHistory.calls("audit-row-count")).toHaveLength(0);
    },
  );
});
