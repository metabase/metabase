import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDatabaseListEndpoint,
  setupDismissUsageMetadataCandidateEndpoint,
  setupRestoreUsageMetadataCandidateEndpoint,
  setupTableQueryMetadataEndpoint,
  setupUsageMetadataCandidateEndpoint,
  setupUsageMetadataCandidatesEndpoint,
  setupUsageMetadataRefreshEndpoint,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import {
  act,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { Route } from "metabase/router";
import { usageMetadataApi } from "metabase-enterprise/api";
import type {
  UsageMetadataCandidateDetail,
  UsageMetadataRefreshStatus,
  UsageMetadataSnapshot,
} from "metabase-types/api";
import {
  createMockDatabase,
  createMockStructuredDatasetQuery,
  createMockTable,
} from "metabase-types/api/mocks";

import { CleanupTablePage } from "./CleanupTablePage";

jest.mock("../../components/CandidateDefinition", () => ({
  CandidateDefinition: () => <div>Read-only definition</div>,
  getCandidateIcon: () => "ruler",
}));

const snapshot: UsageMetadataSnapshot = {
  id: 7,
  finished_at: "2026-07-24T10:00:00Z",
  summary: {
    table_count: 1,
  },
};

const table = {
  id: 1,
  schema: "PUBLIC",
  display_name: "Orders",
  is_published: true,
  database: { id: 1, name: "Sample Database" },
};

const candidate: UsageMetadataCandidateDetail = {
  id: 11,
  candidate_type: "measure",
  table,
  display_name: "Total revenue",
  suggested_name: "Total revenue",
  suggested_description: "Sum of order totals",
  required_tables: [],
  presentation: {
    aggregation: { display_name: "Sum of Total" },
    predicates: [],
  },
  definition: createMockStructuredDatasetQuery({
    query: {
      "source-table": 1,
      aggregation: [["sum", ["field", 2, null]]],
    },
  }),
  modeling_status: "missing",
  dismissed: false,
  evidence: {
    verified_source_count: 1,
    official_source_count: 1,
    popular_source_count: 1,
    distinct_source_count: 12,
    recent_view_count: 400,
  },
  creation_blockers: [],
  sources: [],
  matches: [],
};

const refreshStatus: UsageMetadataRefreshStatus = {
  snapshot,
  active: null,
  failure: null,
};

function setup(
  candidateOverride = candidate,
  initialRoute = "/data-studio/cleanup/tables/1",
) {
  mockGetBoundingClientRect({ width: 1200, height: 700 });
  setupDatabaseListEndpoint([createMockDatabase({ id: 1 })]);
  setupTableQueryMetadataEndpoint(
    createMockTable({
      id: 1,
      db_id: 1,
      display_name: "Orders",
      is_published: true,
    }),
  );
  setupUsageMetadataCandidatesEndpoint({
    data: [candidateOverride],
    total: 42,
    limit: 20,
    offset: 0,
    snapshot,
  });
  setupUsageMetadataRefreshEndpoint(refreshStatus);
  setupUserMetabotPermissionsEndpoint();

  return renderWithProviders(
    <Route
      path="/data-studio/cleanup/tables/:tableId"
      element={<CleanupTablePage />}
    />,
    {
      withRouter: true,
      withUndos: true,
      initialRoute,
    },
  );
}

describe("CleanupTablePage", () => {
  beforeEach(() => {
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
  });

  it("shows a continuous prioritized list and supports one-click dismissal", async () => {
    setupDismissUsageMetadataCandidateEndpoint(candidate.id);
    setup();

    await waitFor(() => {
      expect(screen.getByText("Sum of Total")).toBeInTheDocument();
    });
    expect(screen.getByRole("img", { name: "Measure" })).toBeInTheDocument();
    expect(screen.queryByTestId("pagination-total")).not.toBeInTheDocument();
    expect(screen.queryByText("Sum of order totals")).not.toBeInTheDocument();
    expect(screen.queryByText("Read-only definition")).not.toBeInTheDocument();
    expect(screen.queryByText("Not in Library")).not.toBeInTheDocument();
    expect(screen.queryByText("400 views")).not.toBeInTheDocument();
    expect(
      screen.getByRole("row", { name: "Total revenue" }),
    ).toBeInTheDocument();

    const listCall = fetchMock.callHistory.lastCall(
      "path:/api/ee/data-studio/usage-metadata/candidates",
    );
    expect(listCall?.url).toContain("queue=suggested");
    expect(listCall?.url).toContain("limit=200");

    await userEvent.click(
      screen.getByRole("button", { name: "Dismiss suggestion" }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          `path:/api/ee/data-studio/usage-metadata/candidates/${candidate.id}/dismiss`,
        ),
      ).toBe(true);
    });
  });

  it("renders measure aggregations as text and only uses typed pills for predicates", async () => {
    setup({
      ...candidate,
      display_name: "Active accounts with recent activity",
      presentation: {
        aggregation: { display_name: "Count" },
        predicates: [
          {
            signature: "active",
            display_name: "Is Active is true",
            kind: "boolean",
          },
          {
            signature: "recent",
            display_name: "Created At is in the previous month",
            kind: "temporal",
          },
        ],
      },
    });

    const row = await screen.findByTestId(
      `cleanup-candidate-content-${candidate.id}`,
    );
    expect(row).not.toHaveStyle({ paddingInlineStart: "2.5rem" });
    expect(row).toHaveTextContent("Count");
    expect(row).toHaveTextContent(/where/i);
    expect(
      screen.queryByLabelText("Aggregation: Count"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("Boolean predicate: Is Active is true"),
    ).toHaveAttribute("data-kind", "boolean");
    expect(
      screen.getByLabelText(
        "Time predicate: Created At is in the previous month",
      ),
    ).toHaveAttribute("data-kind", "temporal");
    expect(
      screen.queryByText("Active accounts with recent activity"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Total revenue")).not.toBeInTheDocument();
  });

  it("renders table recommendations as first-class suggestions", async () => {
    setup({
      ...candidate,
      candidate_type: "table",
      display_name: "Publish Orders",
      suggested_name: "Publish Orders",
      suggested_description: "Saved content depends on this table",
      presentation: { predicates: [] },
    });

    await waitFor(() => {
      expect(screen.getByText("Publish Orders")).toBeInTheDocument();
    });
    expect(screen.getByRole("img", { name: "Table" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Tables" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Metrics" })).toBeInTheDocument();
  });

  it("shows a read-only report for metric-shaped questions", async () => {
    const metricCandidate: UsageMetadataCandidateDetail = {
      ...candidate,
      candidate_type: "metric",
      display_name: "Large order trend",
      suggested_name: "Large order trend",
      suggested_description: "Count large orders over time",
      presentation: { predicates: [] },
      required_tables: [
        {
          id: 2,
          database: { id: 1, name: "Sample Database" },
          schema: "PUBLIC",
          display_name: "Customers",
          is_published: false,
        },
      ],
    };
    setupUsageMetadataCandidateEndpoint(metricCandidate.id, metricCandidate);
    setup(metricCandidate);

    await userEvent.click(
      await screen.findByRole("row", { name: "Large order trend" }),
    );

    expect(
      await screen.findByText("Question could be a reusable Metric"),
    ).toBeInTheDocument();
    expect(screen.getByText("Required tables")).toBeInTheDocument();
    expect(screen.getByText("Customers")).toBeInTheDocument();
    expect(screen.getByText("Unpublished")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Create/ }),
    ).not.toBeInTheDocument();
  });

  it("shows a focused candidate review without repeated or technical details", async () => {
    setupUsageMetadataCandidateEndpoint(candidate.id, candidate);
    setup();

    await userEvent.click(
      await screen.findByRole("row", { name: "Total revenue" }),
    );

    const panel = await screen.findByRole("complementary", {
      name: "Candidate report",
    });
    expect(await screen.findByText("Read-only definition")).toBeInTheDocument();
    expect(
      screen.getByText("Measure is missing from the Library"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Saved content uses this definition, but the Library has no related Measure.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Sum of order totals")).not.toBeInTheDocument();
    expect(
      screen.queryByText("No related Library definition was found."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Technical details")).not.toBeInTheDocument();
    expect(
      within(panel).getByText("12 sources · 400 recent views"),
    ).toBeInTheDocument();
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      inline: "end",
    });
    expect(screen.getByTestId("cleanup-table-page")).toBeInTheDocument();
    expect(
      screen.getByTestId(`cleanup-candidate-${candidate.id}`),
    ).toHaveAttribute("data-selected");

    await userEvent.click(
      within(panel).getByRole("button", {
        name: "Close candidate details",
      }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("complementary", { name: "Candidate report" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("row", { name: "Total revenue" }),
    ).toBeInTheDocument();
  });

  it("keeps a directly linked candidate open when the initial list loads", async () => {
    setupUsageMetadataCandidateEndpoint(candidate.id, candidate);
    setup(candidate, `/data-studio/cleanup/tables/1?candidate=${candidate.id}`);

    const panel = await screen.findByRole("complementary", {
      name: "Candidate report",
    });
    expect(
      await screen.findByRole("row", { name: "Total revenue" }),
    ).toHaveAttribute("data-selected");
    expect(panel).toBeVisible();
  });

  it("resets candidate creation drafts and keeps dismissal confirmation concise", async () => {
    setupUsageMetadataCandidateEndpoint(candidate.id, candidate);
    setup();

    await userEvent.click(
      await screen.findByRole("row", { name: "Total revenue" }),
    );
    const panel = await screen.findByRole("complementary", {
      name: "Candidate report",
    });

    await userEvent.click(
      await within(panel).findByRole("button", { name: "Create Measure" }),
    );
    const nameInput = screen.getByRole("textbox", { name: /Name/ });
    const descriptionInput = screen.getByRole("textbox", {
      name: "Description",
    });
    expect(nameInput).toHaveAttribute("maxlength", "254");
    expect(descriptionInput).toHaveAttribute("maxlength", "10000");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Abandoned name");
    await userEvent.clear(descriptionInput);
    await userEvent.type(descriptionInput, "Abandoned description");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await userEvent.click(
      within(panel).getByRole("button", { name: "Create Measure" }),
    );
    expect(screen.getByRole("textbox", { name: /Name/ })).toHaveValue(
      "Total revenue",
    );
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue(
      "Sum of order totals",
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await userEvent.click(
      within(panel).getByRole("button", { name: "Dismiss" }),
    );
    expect(
      screen.getByText(
        "This candidate will stay hidden across future analyses until an administrator restores it.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Reason (optional)" }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  });

  it("closes restored candidate details after it leaves the discarded queue", async () => {
    const dismissedCandidate: UsageMetadataCandidateDetail = {
      ...candidate,
      dismissed: true,
    };
    setupUsageMetadataCandidateEndpoint(candidate.id, dismissedCandidate);
    setupRestoreUsageMetadataCandidateEndpoint(candidate.id);
    setup(dismissedCandidate, "/data-studio/cleanup/tables/1?queue=discarded");

    await userEvent.click(
      await screen.findByRole("row", { name: "Total revenue" }),
    );
    const panel = await screen.findByRole("complementary", {
      name: "Candidate report",
    });

    await userEvent.click(
      await within(panel).findByRole("button", { name: "Restore candidate" }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          `path:/api/ee/data-studio/usage-metadata/candidates/${candidate.id}/dismissal`,
          { method: "DELETE" },
        ),
      ).toBe(true);
      expect(
        screen.queryByRole("complementary", { name: "Candidate report" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByTestId(`cleanup-candidate-${candidate.id}`),
    ).not.toHaveAttribute("data-selected");
  });

  it("keeps loaded candidate details visible during background refetches", async () => {
    setupUsageMetadataCandidateEndpoint(candidate.id, candidate);
    const { store } = setup();

    await userEvent.click(
      await screen.findByRole("row", { name: "Total revenue" }),
    );
    const panel = await screen.findByRole("complementary", {
      name: "Candidate report",
    });
    expect(
      await within(panel).findByText("Read-only definition"),
    ).toBeVisible();

    let resolveCandidateRefetch: (value: UsageMetadataCandidateDetail) => void;
    const candidateRefetch = new Promise<UsageMetadataCandidateDetail>(
      (resolve) => {
        resolveCandidateRefetch = resolve;
      },
    );
    fetchMock.modifyRoute(`usage-metadata-candidate-${candidate.id}`, {
      response: () => candidateRefetch,
    });

    await act(async () => {
      store.dispatch(
        usageMetadataApi.util.invalidateTags([
          { type: "usage-metadata-candidate", id: candidate.id },
        ]),
      );
    });
    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls(`usage-metadata-candidate-${candidate.id}`),
      ).toHaveLength(2);
    });

    expect(screen.getByTestId("cleanup-table-page")).toBeVisible();
    expect(screen.getByRole("row", { name: "Total revenue" })).toBeVisible();
    expect(panel).toBeVisible();
    expect(within(panel).getByText("Read-only definition")).toBeVisible();

    await act(async () => {
      resolveCandidateRefetch!(candidate);
      await candidateRefetch;
    });
  });

  it("clearly explains a partially modeled candidate in the report panel", async () => {
    const statusCandidate = {
      ...candidate,
      modeling_status: "partially-modeled" as const,
    };
    setupUsageMetadataCandidateEndpoint(candidate.id, statusCandidate);
    setup(statusCandidate);

    await userEvent.click(
      await screen.findByRole("row", { name: "Total revenue" }),
    );

    expect(
      await screen.findByText(
        "Measure differs from related Library definitions",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Compare the related definitions before deciding whether to create another Measure.",
      ),
    ).toBeInTheDocument();
  });

  it("shows modeled raw usage as a report without actions", async () => {
    const modeledCandidate = {
      ...candidate,
      modeling_status: "modeled" as const,
      dismissed: true,
    };
    setupUsageMetadataCandidateEndpoint(candidate.id, modeledCandidate);
    setup(modeledCandidate, "/data-studio/cleanup/tables/1?queue=used-raw");

    await userEvent.click(
      await screen.findByRole("row", { name: "Total revenue" }),
    );

    const panel = await screen.findByRole("complementary", {
      name: "Candidate report",
    });
    expect(
      await screen.findByText("Measure is already modeled, but still used raw"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "An exact Library Measure exists, but saved content still uses this raw definition.",
      ),
    ).toBeInTheDocument();
    expect(
      within(panel).queryByRole("button", {
        name: "Dismiss",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(panel).queryByRole("button", {
        name: "Create Measure",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(panel).queryByRole("button", {
        name: "View in Library",
      }),
    ).not.toBeInTheDocument();
  });
});
