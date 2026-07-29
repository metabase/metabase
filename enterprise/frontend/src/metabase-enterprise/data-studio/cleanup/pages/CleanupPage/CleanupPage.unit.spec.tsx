import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDatabaseListEndpoint,
  setupStartUsageMetadataRefreshEndpoint,
  setupUsageMetadataRefreshEndpoint,
  setupUsageMetadataTablesEndpoint,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
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
    is_published: true,
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
    <Route path="/data-studio/cleanup" element={<CleanupPage />} />,
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
    expect(screen.getByText("Published")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Suggested" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Used raw" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Discarded" })).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "Recommended" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "Needs review" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Schema")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Evidence")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Modeling status")).not.toBeInTheDocument();
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

  it("allows an active analysis to be retried after a server restart", async () => {
    const activeStatus: UsageMetadataRefreshStatus = {
      ...refreshStatus,
      active: {
        ...refreshStatus.snapshot!,
        id: 8,
        status: "running",
        summary: null,
        finished_at: null,
      },
    };
    setupStartUsageMetadataRefreshEndpoint({ run_id: 9 });
    setup({ status: activeStatus });

    const refreshButton = await screen.findByRole("button", {
      name: "Refresh analysis",
    });
    expect(refreshButton).toBeEnabled();

    await userEvent.click(refreshButton);

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          "path:/api/ee/data-studio/usage-metadata/refresh",
          { method: "POST" },
        ),
      ).toBe(true);
    });
  });

  it("does not show an older failure after a newer analysis succeeds", async () => {
    setup({
      status: {
        ...refreshStatus,
        failure: {
          ...refreshStatus.snapshot!,
          id: 6,
          status: "failed",
          summary: null,
          error: "Interrupted",
        },
      },
    });

    expect(await screen.findByText("Orders")).toBeInTheDocument();
    expect(
      screen.queryByText(
        "The latest analysis failed. Showing the previous successful results.",
      ),
    ).not.toBeInTheDocument();
  });

  it("shows a failure that happened after the latest successful analysis", async () => {
    setup({
      status: {
        ...refreshStatus,
        failure: {
          ...refreshStatus.snapshot!,
          id: 8,
          status: "failed",
          summary: null,
          error: "Interrupted",
        },
      },
    });

    expect(
      await screen.findByText(
        "The latest analysis failed. Showing the previous successful results.",
      ),
    ).toBeInTheDocument();
  });

  it("switches between suggested, used raw, and discarded candidates", async () => {
    setup();

    await userEvent.click(await screen.findByRole("tab", { name: "Used raw" }));

    await waitFor(() => {
      const call = fetchMock.callHistory.lastCall(
        "path:/api/ee/data-studio/usage-metadata/tables",
      );
      expect(call?.url).toContain("queue=used-raw");
    });

    await userEvent.click(
      await screen.findByRole("tab", { name: "Discarded" }),
    );

    await waitFor(() => {
      const call = fetchMock.callHistory.lastCall(
        "path:/api/ee/data-studio/usage-metadata/tables",
      );
      expect(call?.url).toContain("queue=discarded");
    });
    expect(screen.queryByLabelText("Schema")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Evidence")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Sort candidates")).not.toBeInTheDocument();
  });
});
