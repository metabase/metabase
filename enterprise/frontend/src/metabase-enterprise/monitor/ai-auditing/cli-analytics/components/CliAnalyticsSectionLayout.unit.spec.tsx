import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupGroupsEndpoint,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { Route, redirect } from "metabase/router";
import * as Urls from "metabase/urls";
import { registerVisualizations } from "metabase/visualizations/register";
import { AUDIT_DB_ID } from "metabase-enterprise/monitor/ai-auditing/cli-analytics/constants";
import type { Database, Dataset, Field } from "metabase-types/api";
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

import { CliAnalyticsSectionLayout } from "./CliAnalyticsSectionLayout";
import { CliCallsPage } from "./CliCallsPage";
import { CliUsagePage } from "./CliUsagePage";

registerVisualizations();

const AGENT_API_CALLS_TABLE_ID = 2001;
const GROUP_MEMBERS_TABLE_ID = 2002;

// Field ids are deterministic — `table_id * 100 + field index` (see `buildTable`). Indices below
// match the field order of the `v_agent_api_calls` table defined further down.
const CALL_ID_FIELD_ID = AGENT_API_CALLS_TABLE_ID * 100 + 0;
const CREATED_AT_FIELD_ID = AGENT_API_CALLS_TABLE_ID * 100 + 1;
const OPERATION_FIELD_ID = AGENT_API_CALLS_TABLE_ID * 100 + 2;

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

/** Build a mock audit-DB table (in `AUDIT_DB_ID`) with the given fields, for the metadata endpoint. */
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
    buildTable(AGENT_API_CALLS_TABLE_ID, "v_agent_api_calls", [
      ["text", "call_id", "type/PK"],
      ["dateTime", "created_at", "type/CreationTimestamp"],
      ["text", "operation", "type/Category"],
      ["text", "status", "type/Category"],
      ["integer", "duration_ms", "type/Quantity"],
      ["integer", "user_id", "type/FK"],
      ["text", "user_display_name", "type/Name"],
      ["text", "client_display_name", "type/Category"],
    ]),
    buildTable(GROUP_MEMBERS_TABLE_ID, "v_group_members", [
      ["integer", "user_id", "type/Description"],
      ["integer", "group_id", "type/PK"],
      ["text", "group_name", "type/Name"],
    ]),
  ],
});

// A breakout/count dataset that satisfies both the chart visualizations
// (breakout + aggregation columns) and the events table (named columns).
const datasetResponse: Dataset = createMockDataset({
  data: createMockDatasetData({
    rows: [
      [12, "POST /api/agent/v1/query"],
      [7, "GET /api/agent/v1/search"],
    ],
    cols: [
      createMockColumn({
        source: "aggregation",
        name: "count",
        display_name: "Count",
      }),
      createMockColumn({
        source: "breakout",
        name: "operation",
        display_name: "Operation",
      }),
    ],
  }),
  database_id: AUDIT_DB_ID,
  row_count: 2,
  running_time: 1,
});

const multiPageDatasetResponse: Dataset = createMockDataset({
  data: createMockDatasetData({
    rows: [
      [60, "POST /api/agent/v1/query"],
      [7, "GET /api/agent/v1/search"],
    ],
    cols: [
      createMockColumn({
        source: "aggregation",
        name: "count",
        display_name: "Count",
      }),
      createMockColumn({
        source: "breakout",
        name: "operation",
        display_name: "Operation",
      }),
    ],
  }),
  database_id: AUDIT_DB_ID,
  row_count: 2,
  running_time: 1,
});

// A zero-count aggregation result — what the page's "has any data?" probe gets when the
// filtered view is empty.
const emptyDatasetResponse: Dataset = createMockDataset({
  data: createMockDatasetData({
    rows: [[0]],
    cols: [
      createMockColumn({
        source: "aggregation",
        name: "count",
        display_name: "Count",
      }),
    ],
  }),
  database_id: AUDIT_DB_ID,
  row_count: 1,
  running_time: 1,
});

function setupEndpoints(
  dataset: Dataset = datasetResponse,
  datasetError = false,
) {
  fetchMock.get(`path:/api/database/${AUDIT_DB_ID}/metadata`, auditDatabase);
  fetchMock.post("path:/api/dataset/query_metadata", {
    databases: [auditDatabase],
    tables: auditDatabase.tables ?? [],
    fields: (auditDatabase.tables ?? []).flatMap((table) => table.fields ?? []),
  });
  setupUsersEndpoints([createMockUser({ id: 1, first_name: "Ada" })]);
  setupGroupsEndpoint([createMockGroup({ id: 1, name: "All Users" })]);
  if (datasetError) {
    fetchMock.post("path:/api/dataset", {
      status: 500,
      body: { message: "Audit query failed" },
    });
  } else {
    fetchMock.post("path:/api/dataset", dataset, { name: "dataset" });
  }
}

function setup({
  dataset,
  datasetError,
  initialRoute = Urls.monitorAiAuditingCliUsage(),
}: {
  dataset?: Dataset;
  datasetError?: boolean;
  initialRoute?: string;
} = {}) {
  // TreeTable measures column/row sizes via the DOM; jsdom needs a stubbed rect
  // for its virtualized rows to render.
  mockGetBoundingClientRect({ width: 100, height: 100 });
  setupEnterprisePlugins();
  setupEndpoints(dataset, datasetError);

  return renderWithProviders(
    <Route path={Urls.monitorAiAuditingCli()}>
      <Route index element={redirect("usage")} />
      <Route element={<CliAnalyticsSectionLayout />}>
        <Route path="usage" element={<CliUsagePage />} />
        <Route path="calls" element={<CliCallsPage />} />
      </Route>
    </Route>,
    {
      initialRoute,
      withRouter: true,
      storeInitialState: createMockState({
        settings: mockSettings({
          "token-features": createMockTokenFeatures({ audit_app: true }),
        }),
      }),
    },
  );
}

// MBQL 5 order-by clause: [direction, opts, ["field", opts, fieldId]]
type OrderByClause = [string, unknown, [string, unknown, number]];

type EventsMbqlStage = {
  page?: { page: number; items: number };
  "order-by"?: OrderByClause[];
};

/**
 * The first MBQL stage of every adhoc `dataset` request issued so far.
 */
const eventsDatasetStages = (): EventsMbqlStage[] =>
  fetchMock.callHistory
    .calls("dataset")
    .map((call) => call.options?.body)
    .filter((body): body is string => typeof body === "string")
    .map((body) => {
      // JSON.parse is untyped (`any`); the request body is an MBQL query, so assert its shape.
      const query = JSON.parse(body) as { stages?: EventsMbqlStage[] };
      return query.stages?.[0];
    })
    .filter((stage): stage is EventsMbqlStage => stage != null);

describe("CliAnalyticsSectionLayout", () => {
  it("redirects from root route to the /usage sub-route", async () => {
    const { router } = setup({ initialRoute: Urls.monitorAiAuditingCli() });

    await waitFor(() => {
      expect(router?.location.pathname).toBe(Urls.monitorAiAuditingCliUsage());
    });
    expect(
      await screen.findByRole("heading", { name: "CLI analytics" }),
    ).toBeInTheDocument();
  });

  it("redirects from root route even when the section has no data", async () => {
    const { router } = setup({
      dataset: emptyDatasetResponse,
      initialRoute: Urls.monitorAiAuditingCli(),
    });

    await waitFor(() => {
      expect(router?.location.pathname).toBe(Urls.monitorAiAuditingCliUsage());
    });
    expect(await screen.findByText("No CLI activity")).toBeInTheDocument();
  });

  it("keeps the URL filter params when navigating between /usage and /calls", async () => {
    const { router } = setup({
      initialRoute: `${Urls.monitorAiAuditingCliUsage()}?date=past7days~&user=1`,
    });

    await screen.findByRole("heading", { name: "CLI analytics" });
    await userEvent.click(await screen.findByRole("link", { name: "Calls" }));

    await waitFor(() => {
      expect(router?.location.pathname).toBe(Urls.monitorAiAuditingCliCalls());
    });
    const search = router?.location.search ?? "";
    expect(search).toContain("date=past7days~");
    expect(search).toContain("user=1");

    await userEvent.click(await screen.findByRole("link", { name: "Usage" }));

    await waitFor(() => {
      expect(router?.location.pathname).toBe(Urls.monitorAiAuditingCliUsage());
    });
    const backSearch = router?.location.search ?? "";
    expect(backSearch).toContain("date=past7days~");
    expect(backSearch).toContain("user=1");
  });

  it("renders the header, filters, and /usage route by default", async () => {
    setup();

    expect(
      await screen.findByRole("heading", { name: "CLI analytics" }),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("conversation-filters-date-select"),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: "Usage" }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock.callHistory.called("dataset")).toBe(true);
    });
    expect(await screen.findByText("Calls by operation")).toBeInTheDocument();
    // The errors section renders because the (mocked) error count is > 0.
    expect(await screen.findByText("Errors by operation")).toBeInTheDocument();
  });

  it("navigates to the /calls route and renders the sortable row-level table", async () => {
    const { router } = setup();

    await screen.findByRole("heading", { name: "CLI analytics" });
    await userEvent.click(await screen.findByRole("link", { name: "Calls" }));

    expect(router?.location.pathname).toBe(Urls.monitorAiAuditingCliCalls());
    expect(
      await screen.findByRole("treegrid", { name: "Calls" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("columnheader", { name: "Operation" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("POST /api/agent/v1/query"),
    ).toBeInTheDocument();
  });

  it("sorts the /calls table server-side when a column header is clicked", async () => {
    setup({ initialRoute: Urls.monitorAiAuditingCliCalls() });

    await screen.findByRole("treegrid", { name: "Calls" });

    await userEvent.click(
      await screen.findByRole("columnheader", { name: "Operation" }),
    );

    await waitFor(() => {
      const sortedStage = eventsDatasetStages().find(
        (stage) => stage.page != null && stage["order-by"]?.[0]?.[0] === "asc",
      );
      expect(
        sortedStage?.["order-by"]?.map(([direction, , [, , fieldId]]) => [
          direction,
          fieldId,
        ]),
      ).toEqual([
        ["asc", OPERATION_FIELD_ID],
        ["desc", CALL_ID_FIELD_ID],
      ]);
    });
  });

  it("paginates the /calls table when there are more matching rows than one page", async () => {
    setup({
      dataset: multiPageDatasetResponse,
      initialRoute: Urls.monitorAiAuditingCliCalls(),
    });

    const pagination = await screen.findByRole("navigation", {
      name: "pagination",
    });
    expect(within(pagination).getByLabelText("Previous page")).toBeDisabled();
    const nextButton = within(pagination).getByLabelText("Next page");
    expect(nextButton).toBeEnabled();

    await userEvent.click(nextButton);

    // Advancing issues an adhoc dataset query for the second MBQL page (1-indexed).
    await waitFor(() => {
      const requestedPage2 = eventsDatasetStages().some(
        (stage) => stage.page?.page === 2,
      );
      expect(requestedPage2).toBe(true);
    });
  });

  it("updates the page URL param when Next is clicked", async () => {
    const { router } = setup({
      dataset: multiPageDatasetResponse,
      initialRoute: Urls.monitorAiAuditingCliCalls(),
    });

    const pagination = await screen.findByRole("navigation", {
      name: "pagination",
    });
    await userEvent.click(within(pagination).getByLabelText("Next page"));
    await waitFor(() => {
      expect(router?.location.search).toContain("page=1");
    });
  });

  it("orders the /calls query by a total order (created_at + call_id) for stable paging", async () => {
    setup({ initialRoute: Urls.monitorAiAuditingCliCalls() });

    // The calls request is the paginated one (carries a `page` clause); its order-by must be
    // created_at + call_id (PK) tiebreaker, so pages can't skip/duplicate rows on
    // tied timestamps.
    await waitFor(() => {
      const eventsStage = eventsDatasetStages().find(
        (stage) => stage.page != null,
      );
      expect(eventsStage?.["order-by"]?.map((clause) => clause[2][2])).toEqual([
        CREATED_AT_FIELD_ID,
        CALL_ID_FIELD_ID,
      ]);
    });
  });

  it("shows an error instead of spinning forever when the count query fails", async () => {
    setup({ datasetError: true });

    expect(
      await screen.findByRole("heading", { name: "CLI analytics" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Audit query failed")).toBeInTheDocument();
    expect(screen.queryByText("Calls by operation")).not.toBeInTheDocument();
  });

  it("keeps the shared filters visible after navigating between /usage and /calls", async () => {
    setup();

    await screen.findByRole("heading", { name: "CLI analytics" });
    expect(
      screen.getByTestId("conversation-filters-date-select"),
    ).toBeInTheDocument();

    await userEvent.click(await screen.findByRole("link", { name: "Calls" }));
    await screen.findByRole("treegrid", { name: "Calls" });
    expect(
      screen.getByTestId("conversation-filters-date-select"),
    ).toBeInTheDocument();
  });

  it("keeps the header, tabs, and filters visible and shows an empty state in place of the tab content when there is no activity", async () => {
    setup({ dataset: emptyDatasetResponse });

    expect(
      await screen.findByRole("heading", { name: "CLI analytics" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("No CLI activity")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Usage" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Calls" })).toBeInTheDocument();
    expect(
      screen.getByTestId("conversation-filters-date-select"),
    ).toBeInTheDocument();
  });
});
