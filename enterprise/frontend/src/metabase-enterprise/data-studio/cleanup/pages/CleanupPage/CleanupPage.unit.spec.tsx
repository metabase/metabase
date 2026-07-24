import fetchMock from "fetch-mock";

import {
  setupDatabaseListEndpoint,
  setupStartUsageMetadataRefreshEndpoint,
  setupUsageMetadataRefreshEndpoint,
  setupUsageMetadataTablesEndpoint,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import type {
  UsageMetadataRefreshStatus,
  UsageMetadataSnapshot,
  UsageMetadataTableSummary,
} from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks";

import { CleanupPage } from "./CleanupPage";

const snapshot: UsageMetadataSnapshot = {
  id: 7,
  finished_at: "2026-07-24T10:00:00Z",
  algorithm_version: 1,
  summary: {
    "candidate-count": 6,
    "measure-count": 3,
    "segment-count": 3,
    "table-count": 1,
  },
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

const tableSummary: UsageMetadataTableSummary = {
  table: {
    id: 1,
    db_id: 1,
    schema: "PUBLIC",
    name: "orders",
    display_name: "Orders",
    description: null,
    data_layer: null,
    data_authority: null,
    view_count: 12,
    is_published: false,
    collection_id: null,
    database: { id: 1, name: "Sample Database" },
  },
  candidate_count: 6,
  counts: {
    measure: {
      missing: 2,
      "partially-modeled": 1,
      modeled: 0,
    },
    segment: {
      missing: 1,
      "partially-modeled": 0,
      modeled: 2,
    },
  },
};

function setup({
  status = refreshStatus,
  tables = [tableSummary],
}: {
  status?: UsageMetadataRefreshStatus;
  tables?: UsageMetadataTableSummary[];
} = {}) {
  setupDatabaseListEndpoint([createMockDatabase({ id: 1 })]);
  setupUserMetabotPermissionsEndpoint();
  setupUsageMetadataRefreshEndpoint(status);
  setupUsageMetadataTablesEndpoint({
    data: tables,
    total: tables.length,
    limit: 50,
    offset: 0,
    snapshot: status.snapshot
      ? {
          id: status.snapshot.id,
          finished_at: status.snapshot.finished_at!,
          algorithm_version: status.snapshot.algorithm_version,
          summary: status.snapshot.summary,
        }
      : null,
  });

  renderWithProviders(
    <Route path="/data-studio/cleanup" component={CleanupPage} />,
    {
      withRouter: true,
      initialRoute: "/data-studio/cleanup",
    },
  );
}

describe("CleanupPage", () => {
  beforeEach(() => {
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
  });

  it("shows the persisted table cleanup queue", async () => {
    setup();

    expect(await screen.findByText("Orders")).toBeInTheDocument();
    expect(screen.getByText("Unpublished")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("Not in Library")).toBeInTheDocument();
    expect(screen.getByText("Needs review")).toBeInTheDocument();
    expect(screen.getByText("Modeled, still used raw")).toBeInTheDocument();
  });

  it("offers an explicit first analysis when no snapshot exists", async () => {
    const emptyStatus: UsageMetadataRefreshStatus = {
      snapshot: null,
      active: null,
      failure: null,
      fresh: false,
    };
    setupStartUsageMetadataRefreshEndpoint({ run_id: 9 });
    setup({ status: emptyStatus, tables: [] });

    expect(
      await screen.findByText("Find cleanup opportunities"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Analyze instance" }),
    ).toBeInTheDocument();
  });
});
