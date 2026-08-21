import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDatabaseListEndpoint,
  setupStartUsageMetadataRefreshEndpoint,
  setupUsageMetadataRefreshEndpoint,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import {
  fireEvent,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import { Route } from "metabase/router";
import type {
  UsageMetadataRefreshStatus,
  UsageMetadataRunState,
  UsageMetadataSnapshot,
  UsageMetadataTableSummary,
} from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks";

import { CleanupPage } from "./CleanupPage";

const snapshot: UsageMetadataSnapshot = {
  id: 7,
  finished_at: "2026-07-24T10:00:00Z",
  summary: {
    table_count: 1,
  },
};

const refreshRun: UsageMetadataRunState = {
  id: snapshot.id,
  status: "running",
};

const refreshStatus: UsageMetadataRefreshStatus = {
  snapshot,
  active: null,
  failure: null,
};

const tableSummary: UsageMetadataTableSummary = {
  table: {
    id: 1,
    schema: "PUBLIC",
    display_name: "Orders",
    is_published: true,
    database: { id: 1, name: "Sample Database" },
  },
  candidate_count: 6,
};

function setup({
  status = refreshStatus,
  tables = [tableSummary],
  deferredQueue,
  secondPageTotal,
}: {
  status?: UsageMetadataRefreshStatus;
  tables?: UsageMetadataTableSummary[];
  deferredQueue?: "used-raw" | "discarded";
  secondPageTotal?: number;
} = {}) {
  let resolveDeferredResponse: (() => void) | undefined;
  mockGetBoundingClientRect({ width: 1200, height: 700 });
  setupDatabaseListEndpoint([createMockDatabase({ id: 1 })]);
  setupUserMetabotPermissionsEndpoint();
  setupUsageMetadataRefreshEndpoint(status);
  fetchMock.get("path:/api/ee/data-studio/usage-metadata/tables", (call) => {
    const url = new URL(call.url);
    const limit = Number(url.searchParams.get("limit"));
    const offset = Number(url.searchParams.get("offset"));
    const response = {
      data: tables.slice(offset, offset + limit),
      total:
        offset > 0 && secondPageTotal != null ? secondPageTotal : tables.length,
      limit,
      offset,
      snapshot: status.snapshot
        ? {
            id: status.snapshot.id,
            finished_at: status.snapshot.finished_at ?? snapshot.finished_at,
            summary: status.snapshot.summary,
          }
        : null,
    };
    if (url.searchParams.get("queue") === deferredQueue) {
      return new Promise((resolve) => {
        resolveDeferredResponse = () => resolve(response);
      });
    }
    return response;
  });

  renderWithProviders(
    <Route path="/data-studio/cleanup" element={<CleanupPage />} />,
    {
      withRouter: true,
      initialRoute: "/data-studio/cleanup",
    },
  );

  return {
    resolveDeferredResponse: () => resolveDeferredResponse?.(),
  };
}

describe("CleanupPage", () => {
  beforeEach(() => {
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
  });

  it("shows the persisted table cleanup queue", async () => {
    setup();

    expect(await screen.findByText("Orders")).toBeInTheDocument();
    expect(
      screen.getByText("1 table with recommendations"),
    ).toBeInTheDocument();
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
    expect(screen.queryByTestId("pagination-total")).not.toBeInTheDocument();

    const listCall = fetchMock.callHistory.lastCall(
      "path:/api/ee/data-studio/usage-metadata/tables",
    );
    expect(listCall?.url).toContain("limit=200");
  });

  it("loads one additional API page when the list approaches the scroll boundary", async () => {
    const tables = Array.from({ length: 201 }, (_, index) => ({
      ...tableSummary,
      table: {
        ...tableSummary.table,
        id: index + 1,
        display_name: `Table ${index + 1}`,
      },
    }));
    setup({ tables });

    expect(await screen.findByText("Table 1")).toBeInTheDocument();
    expect(
      fetchMock.callHistory
        .calls("path:/api/ee/data-studio/usage-metadata/tables")
        .map((call) => new URL(call.url).searchParams.get("offset")),
    ).toEqual(["0"]);

    const scrollContainer = screen.getByTestId("tree-table-scroll-container");
    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 500 },
      scrollHeight: { configurable: true, value: 1_500 },
      scrollTop: { configurable: true, value: 800, writable: true },
    });
    fireEvent.scroll(scrollContainer);
    fireEvent.scroll(scrollContainer);
    fireEvent.scroll(scrollContainer);

    await waitFor(() => {
      expect(
        fetchMock.callHistory
          .calls("path:/api/ee/data-studio/usage-metadata/tables")
          .map((call) => new URL(call.url).searchParams.get("offset")),
      ).toEqual(["0", "200"]);
    });
  });

  it("restarts pagination when a candidate mutation changes the total", async () => {
    const tables = Array.from({ length: 201 }, (_, index) => ({
      ...tableSummary,
      table: {
        ...tableSummary.table,
        id: index + 1,
        display_name: `Table ${index + 1}`,
      },
    }));
    setup({ tables, secondPageTotal: 200 });

    expect(await screen.findByText("Table 1")).toBeInTheDocument();
    const scrollContainer = screen.getByTestId("tree-table-scroll-container");
    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 500 },
      scrollHeight: { configurable: true, value: 1_500 },
      scrollTop: { configurable: true, value: 800, writable: true },
    });
    fireEvent.scroll(scrollContainer);

    await waitFor(() => {
      expect(
        fetchMock.callHistory
          .calls("path:/api/ee/data-studio/usage-metadata/tables")
          .map((call) => new URL(call.url).searchParams.get("offset")),
      ).toEqual(["0", "200", "0"]);
    });
  });

  it("debounces search before updating the URL and fetching", async () => {
    setup();

    const search = await screen.findByRole("textbox", {
      name: "Search cleanup candidates",
    });
    await userEvent.type(search, "Orders");

    expect(
      fetchMock.callHistory
        .calls("path:/api/ee/data-studio/usage-metadata/tables")
        .filter((call) => new URL(call.url).searchParams.has("search")),
    ).toHaveLength(0);

    await waitFor(() => {
      expect(
        fetchMock.callHistory
          .calls("path:/api/ee/data-studio/usage-metadata/tables")
          .filter((call) => new URL(call.url).searchParams.has("search")),
      ).toHaveLength(1);
    });
    expect(
      fetchMock.callHistory
        .calls("path:/api/ee/data-studio/usage-metadata/tables")
        .filter((call) => new URL(call.url).searchParams.has("search")),
    ).toHaveLength(1);
  });

  it("offers an explicit first analysis when no snapshot exists", async () => {
    const emptyStatus: UsageMetadataRefreshStatus = {
      snapshot: null,
      active: null,
      failure: null,
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
        ...refreshRun,
        id: 8,
        status: "running",
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
          ...refreshRun,
          id: 6,
          status: "failed",
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
          ...refreshRun,
          id: 8,
          status: "failed",
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

  it("hides stale rows while changing queues", async () => {
    const request = setup({ deferredQueue: "used-raw" });
    expect(await screen.findByText("Orders")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Used raw" }));

    await waitFor(() => {
      expect(screen.queryByText("Orders")).not.toBeInTheDocument();
    });

    request.resolveDeferredResponse();
    expect(await screen.findByText("Orders")).toBeInTheDocument();
  });
});
