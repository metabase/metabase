import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDatabaseListEndpoint,
  setupDismissUsageMetadataCandidateEndpoint,
  setupTableQueryMetadataEndpoint,
  setupUsageMetadataCandidateEndpoint,
  setupUsageMetadataCandidatesEndpoint,
  setupUsageMetadataRefreshEndpoint,
  setupUsageMetadataTableEndpoint,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { Route } from "metabase/router";
import type {
  UsageMetadataCandidateDetail,
  UsageMetadataRefreshStatus,
  UsageMetadataSnapshot,
  UsageMetadataTableDetail,
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
  algorithm_version: 1,
  summary: {
    "candidate-count": 42,
    "measure-count": 42,
    "segment-count": 0,
    "table-count": 1,
  },
};

const table = {
  id: 1,
  db_id: 1,
  schema: "PUBLIC",
  name: "orders",
  display_name: "Orders",
  description: null,
  data_layer: null,
  data_authority: null,
  view_count: 12,
  is_published: true,
  collection_id: 2,
  database: { id: 1, name: "Sample Database" },
};

const candidate: UsageMetadataCandidateDetail = {
  id: 11,
  candidate_type: "measure",
  table,
  display_name: "Total revenue",
  suggested_name: "Total revenue",
  suggested_description: "Sum of order totals",
  family: { key: "family", position: 0, depth: 0 },
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
    total_view_count: 400,
  },
  creation_blockers: [],
  semantic_details: {},
  dismissal: null,
  sources: [],
  matches: [],
};

const tableDetail: UsageMetadataTableDetail = {
  table,
  candidate_count: 42,
  dismissed_count: 0,
  counts: {
    measure: {
      missing: 40,
      "partially-modeled": 2,
      modeled: 0,
    },
    segment: {
      missing: 0,
      "partially-modeled": 0,
      modeled: 0,
    },
  },
  snapshot,
};

const refreshStatus: UsageMetadataRefreshStatus = {
  snapshot: {
    ...snapshot,
    status: "succeeded",
    trigger: "manual",
    requested_by: 1,
    source_config: {},
    error: null,
    created_at: snapshot.finished_at,
    started_at: snapshot.finished_at,
  },
  active: null,
  failure: null,
  fresh: true,
};

function setup(
  candidateOverride = candidate,
  initialRoute = "/data-studio/cleanup/tables/1",
) {
  setupDatabaseListEndpoint([createMockDatabase({ id: 1 })]);
  setupTableQueryMetadataEndpoint(
    createMockTable({ id: 1, db_id: 1, display_name: "Orders" }),
  );
  setupUsageMetadataTableEndpoint(1, tableDetail);
  setupUsageMetadataCandidatesEndpoint({
    data: [candidateOverride],
    total: 42,
    limit: 20,
    offset: 0,
    snapshot,
  });
  setupUsageMetadataRefreshEndpoint(refreshStatus);
  setupUserMetabotPermissionsEndpoint();

  renderWithProviders(
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

  it("starts with 20 prioritized suggestions and supports one-click dismissal", async () => {
    setupDismissUsageMetadataCandidateEndpoint(candidate.id, {
      ...candidate,
      dismissed: true,
      dismissal: {
        id: 1,
        dismissed_by: 1,
        dismissed_at: "2026-07-27T10:00:00Z",
        reason: null,
      },
    });
    setup();

    expect(await screen.findByText("Total revenue")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Measure" })).toBeInTheDocument();
    expect(screen.getByTestId("pagination-total")).toHaveTextContent("42");
    expect(screen.queryByText("Sum of order totals")).not.toBeInTheDocument();
    expect(screen.queryByText("Read-only definition")).not.toBeInTheDocument();
    expect(screen.queryByText("Not in Library")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Total revenue" }),
    ).toBeInTheDocument();

    const listCall = fetchMock.callHistory.lastCall(
      "path:/api/ee/data-studio/usage-metadata/candidates",
    );
    expect(listCall?.url).toContain("queue=suggested");
    expect(listCall?.url).toContain("limit=20");
    expect(listCall?.url).toContain("sort=priority");

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

  it("uses the family display name and indents related recommendations", async () => {
    setup({
      ...candidate,
      display_name: "Active accounts with recent activity",
      family: { key: "active-accounts", position: 2, depth: 2 },
    });

    const row = await screen.findByRole("button", {
      name: "Active accounts with recent activity",
    });
    expect(row).toHaveStyle({ paddingInlineStart: "3.5rem" });
    expect(screen.queryByText("Total revenue")).not.toBeInTheDocument();
  });

  it("shows a focused candidate review without repeated or technical details", async () => {
    setupUsageMetadataCandidateEndpoint(candidate.id, candidate);
    setup();

    await userEvent.click(
      await screen.findByRole("button", { name: "Total revenue" }),
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
      within(panel).getByText("12 sources · 400 views"),
    ).toBeInTheDocument();
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
      screen.getByRole("button", { name: "Total revenue" }),
    ).toBeInTheDocument();
  });

  it("clearly explains a partially modeled candidate in the report panel", async () => {
    const statusCandidate = {
      ...candidate,
      modeling_status: "partially-modeled" as const,
    };
    setupUsageMetadataCandidateEndpoint(candidate.id, statusCandidate);
    setup(statusCandidate);

    await userEvent.click(
      await screen.findByRole("button", { name: "Total revenue" }),
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
      await screen.findByRole("button", { name: "Total revenue" }),
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
