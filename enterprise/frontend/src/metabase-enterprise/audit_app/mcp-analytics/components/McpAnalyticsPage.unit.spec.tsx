import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupGroupsEndpoint,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { Route, withRouteProps } from "metabase/router";
import { registerVisualizations } from "metabase/visualizations/register";
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

import { AUDIT_DB_ID } from "../constants";

import { McpAnalyticsPage } from "./McpAnalyticsPage";

const RoutedMcpAnalyticsPage = withRouteProps(McpAnalyticsPage);

registerVisualizations();

const MCP_TOOL_CALLS_TABLE_ID = 2001;
const GROUP_MEMBERS_TABLE_ID = 2002;

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
    buildTable(MCP_TOOL_CALLS_TABLE_ID, "v_mcp_tool_calls", [
      ["text", "tool_call_id", "type/PK"],
      ["dateTime", "created_at", "type/CreationTimestamp"],
      ["text", "tool_name", "type/Category"],
      ["text", "status", "type/Category"],
      ["integer", "duration_ms", "type/Quantity"],
      ["integer", "user_id", "type/FK"],
      ["text", "user_display_name", "type/Name"],
      ["text", "client_display_name", "type/Category"],
      ["text", "client_version", "type/Category"],
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
// Aggregation column first so the page's no-breakout count probe (reads rows[0][0]) sees a
// positive number; the `source` tags still let the breakout charts find the right columns.
const datasetResponse: Dataset = createMockDataset({
  data: createMockDatasetData({
    rows: [
      [12, "search_data"],
      [7, "run_query"],
    ],
    cols: [
      createMockColumn({
        source: "aggregation",
        name: "count",
        display_name: "Count",
      }),
      createMockColumn({
        source: "breakout",
        name: "tool_name",
        display_name: "Tool name",
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

/** Mock the audit-DB metadata, users/groups, and the `/api/dataset` adhoc endpoint (with the given dataset). */
function setupEndpoints(dataset: Dataset = datasetResponse) {
  fetchMock.get(`path:/api/database/${AUDIT_DB_ID}/metadata`, auditDatabase);
  setupUsersEndpoints([createMockUser({ id: 1, first_name: "Ada" })]);
  setupGroupsEndpoint([createMockGroup({ id: 1, name: "All Users" })]);
  fetchMock.post("path:/api/dataset", dataset, { name: "dataset" });
}

/** Render `McpAnalyticsPage` at its route with EE plugins + `audit_app`, optionally overriding the dataset response. */
function setup({ dataset }: { dataset?: Dataset } = {}) {
  setupEnterprisePlugins();
  setupEndpoints(dataset);

  return renderWithProviders(
    <Route
      path="/admin/metabot/usage-auditing/mcp"
      element={<RoutedMcpAnalyticsPage />}
    />,
    {
      initialRoute: "/admin/metabot/usage-auditing/mcp",
      withRouter: true,
      storeInitialState: createMockState({
        settings: mockSettings({
          "token-features": createMockTokenFeatures({ audit_app: true }),
          "mcp-enabled?": true,
        }),
      }),
    },
  );
}

describe("McpAnalyticsPage", () => {
  it("renders the header, filters, and charts tab", async () => {
    setup();

    expect(
      await screen.findByRole("heading", { name: "MCP analytics" }),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("conversation-filters-date-select"),
    ).toBeInTheDocument();
    // Tabs appear only after the initial count query resolves (the page shows a loader first).
    expect(
      await screen.findByRole("tab", { name: "Usage" }),
    ).toBeInTheDocument();

    // Charts run ad-hoc dataset queries through /api/dataset.
    await waitFor(() => {
      expect(fetchMock.callHistory.called("dataset")).toBe(true);
    });
    expect(await screen.findByText("Calls by tool")).toBeInTheDocument();
    // The errors section renders because the (mocked) error count is > 0.
    expect(await screen.findByText("Errors by type")).toBeInTheDocument();
  });

  it("switches to the events tab and renders the row-level table", async () => {
    setup();

    await screen.findByRole("heading", { name: "MCP analytics" });
    await userEvent.click(
      await screen.findByRole("tab", { name: "Tool calls" }),
    );

    const eventsPanel = screen.getByRole("tabpanel");
    expect(
      await within(eventsPanel).findByTestId("table-root"),
    ).toBeInTheDocument();
  });

  it("shows a single empty state (no tabs, no charts) when there is no activity", async () => {
    setup({ dataset: emptyDatasetResponse });

    expect(
      await screen.findByRole("heading", { name: "MCP analytics" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("No MCP activity")).toBeInTheDocument();

    // No tabs render when the view is empty — so neither the charts nor the events table can.
    expect(
      screen.queryByRole("tab", { name: "Usage" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "Tool calls" }),
    ).not.toBeInTheDocument();
  });
});
