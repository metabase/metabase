import fetchMock from "fetch-mock";

import {
  setupTaskCountsEndpoint,
  setupTaskCountsErrorEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { Route } from "metabase/router";
import type { TaskCountsResponse } from "metabase-types/api";

import { TasksSectionLayout } from "../../routes";

import { TasksTabs } from "./TasksTabs";

interface SetupOpts {
  counts?: TaskCountsResponse;
  error?: boolean;
  delay?: number;
  initialRoute?: string;
}

function setup({
  counts = { tasks: 137, runs: 0 },
  error = false,
  delay,
  initialRoute = "/monitor/tasks/list?status=failed",
}: SetupOpts = {}) {
  if (error) {
    setupTaskCountsErrorEndpoint();
  } else {
    setupTaskCountsEndpoint(counts, { delay });
  }
  return renderWithProviders(
    <Route element={<TasksSectionLayout />}>
      <Route
        path="*"
        element={
          <TasksTabs>
            <div>Task table</div>
          </TasksTabs>
        }
      />
    </Route>,
    { withRouter: true, initialRoute },
  );
}

const getTab = (name: string) => screen.getByRole("link", { name });

const getCountCalls = () =>
  fetchMock.callHistory.calls("path:/api/task/counts");

describe("TasksTabs", () => {
  it("shows exact counts, including zero, from a count-only request without table filters", async () => {
    setup();

    expect(await within(getTab("Tasks")).findByText("137")).toBeInTheDocument();
    expect(within(getTab("Runs")).getByText("0")).toBeInTheDocument();
    expect(getCountCalls()).toHaveLength(1);
    expect(new URL(getCountCalls()[0].url).search).toBe("");
    expect(fetchMock.callHistory.calls("path:/api/task")).toHaveLength(0);
    expect(fetchMock.callHistory.calls("path:/api/task/runs")).toHaveLength(0);
  });

  it("shows placeholders without blocking the table or navigation while counts load", async () => {
    setup({ delay: 100 });

    expect(
      within(getTab("Tasks")).getByTestId("tab-count-skeleton"),
    ).toBeInTheDocument();
    expect(
      within(getTab("Runs")).getByTestId("tab-count-skeleton"),
    ).toBeInTheDocument();
    expect(getTab("Runs")).toHaveAttribute("href", "/monitor/tasks/runs");
    expect(screen.getByText("Task table")).toBeInTheDocument();
    expect(await within(getTab("Tasks")).findByText("137")).toBeInTheDocument();
  });

  it("hides failed counters without hiding tabs or table content", async () => {
    setup({ error: true });

    await waitFor(() => {
      expect(getCountCalls()).toHaveLength(1);
      expect(fetchMock.callHistory.done("path:/api/task/counts")).toBe(true);
      expect(screen.queryAllByTestId("tab-count-skeleton")).toHaveLength(0);
    });
    expect(within(getTab("Tasks")).queryByText(/\d/)).not.toBeInTheDocument();
    expect(within(getTab("Runs")).queryByText(/\d/)).not.toBeInTheDocument();
    expect(screen.getByText("Task table")).toBeInTheDocument();
  });
});
