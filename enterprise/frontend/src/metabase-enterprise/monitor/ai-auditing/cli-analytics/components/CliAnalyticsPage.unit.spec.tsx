import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupGroupsEndpoint,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
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

import { CliAnalyticsPage } from "./CliAnalyticsPage";

registerVisualizations();

const AGENT_API_CALLS_TABLE_ID = 2001;
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
// Aggregation column first so the page's no-breakout count probe (reads rows[0][0]) sees a
// positive number; the `source` tags still let the breakout charts find the right columns.
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

/** Render `CliAnalyticsPage` at its route with EE plugins + `audit_app`, optionally overriding the dataset response. */
function setup({ dataset }: { dataset?: Dataset } = {}) {
  // TreeTable measures column/row sizes via the DOM; jsdom needs a stubbed rect
  // for its virtualized rows to render.
  mockGetBoundingClientRect({ width: 100, height: 100 });
  setupEnterprisePlugins();
  setupEndpoints(dataset);

  return renderWithProviders(
    <Route path="/monitor/ai-auditing/cli" element={<CliAnalyticsPage />} />,
    {
      initialRoute: "/monitor/ai-auditing/cli",
      withRouter: true,
      storeInitialState: createMockState({
        settings: mockSettings({
          "token-features": createMockTokenFeatures({ audit_app: true }),
        }),
      }),
    },
  );
}

describe("CliAnalyticsPage", () => {
  it("renders the header, filters, and charts tab", async () => {
    setup();

    expect(
      await screen.findByRole("heading", { name: "CLI analytics" }),
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
    expect(await screen.findByText("Calls by operation")).toBeInTheDocument();
    // The errors section renders because the (mocked) error count is > 0.
    expect(await screen.findByText("Errors by operation")).toBeInTheDocument();
  });

  it("switches to the calls tab and renders the sortable row-level table", async () => {
    setup();

    await screen.findByRole("heading", { name: "CLI analytics" });
    await userEvent.click(await screen.findByRole("tab", { name: "Calls" }));

    const eventsPanel = screen.getByRole("tabpanel");
    expect(
      await within(eventsPanel).findByRole("treegrid", { name: "Calls" }),
    ).toBeInTheDocument();
    // a curated column header and a cell value from the mocked page render
    expect(
      await within(eventsPanel).findByRole("columnheader", {
        name: "Operation",
      }),
    ).toBeInTheDocument();
    expect(
      await within(eventsPanel).findByText("POST /api/agent/v1/query"),
    ).toBeInTheDocument();
  });

  it("keeps the header, tabs, and filters visible and shows an empty state in place of the tab content when there is no activity", async () => {
    setup({ dataset: emptyDatasetResponse });

    expect(
      await screen.findByRole("heading", { name: "CLI analytics" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("No CLI activity")).toBeInTheDocument();

    // Tabs and filters stay visible even when the view is empty — only the tab content swaps out.
    const usageTab = screen.getByRole("tab", { name: "Usage" });
    expect(usageTab).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Calls" })).toBeInTheDocument();
    expect(
      screen.getByTestId("conversation-filters-date-select"),
    ).toBeInTheDocument();

    const panel = screen.getByRole("tabpanel");
    expect(usageTab).toHaveAttribute("aria-controls", panel.id);
    expect(within(panel).getByText("No CLI activity")).toBeInTheDocument();
  });
});
