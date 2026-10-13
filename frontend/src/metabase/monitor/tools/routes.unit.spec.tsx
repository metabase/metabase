import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDatabasesEndpoints,
  setupTaskCountsEndpoint,
  setupTaskCountsErrorEndpoint,
  setupTaskRunsEndpoints,
  setupTasksEndpoints,
  setupUniqueTasksEndpoint,
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
import * as Urls from "metabase/urls";
import { defer } from "metabase/utils/promise";
import type {
  ListTaskRunsResponse,
  ListTasksResponse,
  TaskCountsResponse,
} from "metabase-types/api";
import { createMockTaskRun } from "metabase-types/api/mocks";

import { getTasksRoutes } from "./routes";

interface SetupOpts {
  countsError?: boolean;
  initialRoute?: string;
}

function setup({
  countsError = false,
  initialRoute = Urls.monitorTasksList(),
}: SetupOpts = {}) {
  if (countsError) {
    setupTaskCountsErrorEndpoint();
  } else {
    setupTaskCountsEndpoint({ tasks: 137, runs: 1 }, { name: "task-counts" });
  }
  const tasksResponse: ListTasksResponse = {
    data: [],
    total: 0,
    limit: 50,
    offset: 0,
  };
  const runsResponse: ListTaskRunsResponse = {
    data: [createMockTaskRun()],
    total: 1,
    limit: 50,
    offset: 0,
  };
  setupTasksEndpoints(tasksResponse);
  setupTaskRunsEndpoints(runsResponse);
  setupDatabasesEndpoints([]);
  setupUniqueTasksEndpoint([]);
  mockGetBoundingClientRect({ width: 100, height: 100 });

  return renderWithProviders(
    <>
      <Route path={Urls.monitorTasks()}>{getTasksRoutes()}</Route>
      <Route path="/outside" element={<div>Outside the section</div>} />
    </>,
    { withRouter: true, initialRoute },
  );
}

const getCountCalls = () =>
  fetchMock.callHistory.calls("path:/api/task/counts");
const getTasksTab = () => screen.getByRole("link", { name: "Tasks" });

async function switchToRuns() {
  await userEvent.click(screen.getByRole("link", { name: "Runs" }));
  expect(await screen.findByTestId("task-run")).toBeVisible();
}

async function switchToTasks() {
  await userEvent.click(getTasksTab());
  expect(await screen.findByText("No results")).toBeVisible();
}

describe("task section counts", () => {
  it("requests default counts independently of table filters and pagination", async () => {
    setup({ initialRoute: `${Urls.monitorTasksRuns()}?status=failed` });
    expect(await screen.findByTestId("task-run")).toBeVisible();
    expect(await within(getTasksTab()).findByText("137")).toBeVisible();
    expect(
      within(screen.getByRole("link", { name: "Runs" })).getByText("1"),
    ).toBeVisible();
    const calls = getCountCalls();
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0].url).search).toBe("");
    const listCalls = fetchMock.callHistory.calls("path:/api/task/runs");
    expect(listCalls).toHaveLength(1);
    const params = new URL(listCalls[0].url).searchParams;
    expect(params.get("status")).toBe("failed");
    expect(params.get("offset")).toBe("0");
    expect(params.get("limit")).toBe("50");
  });

  it("does not block tab navigation while counts are pending", async () => {
    const pending = defer<TaskCountsResponse>();
    setup();
    fetchMock.modifyRoute("task-counts", { response: () => pending.promise });
    try {
      expect(await screen.findByText("No results")).toBeVisible();
      await switchToRuns();
      await switchToTasks();
      expect(getCountCalls()).toHaveLength(1);
      await act(async () => pending.resolve({ tasks: 137, runs: 1 }));
      expect(await within(getTasksTab()).findByText("137")).toBeVisible();
    } finally {
      pending.resolve({ tasks: 137, runs: 1 });
    }
  });

  it.each([false, true])(
    "does not refetch counts on tab switches (countsError: %s)",
    async (countsError) => {
      setup({ countsError });
      expect(await screen.findByText("No results")).toBeVisible();
      await waitFor(() =>
        expect(fetchMock.callHistory.done("path:/api/task/counts")).toBe(true),
      );
      await waitFor(() =>
        expect(within(getTasksTab()).queryByText("137") !== null).toBe(
          !countsError,
        ),
      );
      for (let visit = 0; visit < 2; visit++) {
        await switchToRuns();
        await switchToTasks();
      }
      expect(getCountCalls()).toHaveLength(1);
    },
  );

  it("refreshes cached counts when reentering the section", async () => {
    const { router } = setup();
    if (!router) {
      throw new Error("Expected test router");
    }
    const tasksTab = await screen.findByRole("link", { name: "Tasks" });
    expect(await within(tasksTab).findByText("137")).toBeVisible();
    act(() => router.navigate("/outside"));
    expect(await screen.findByText("Outside the section")).toBeVisible();
    fetchMock.modifyRoute("task-counts", {
      response: { tasks: 138, runs: 1 },
    });
    act(() => router.navigate(Urls.monitorTasksRuns()));
    expect(await screen.findByTestId("task-run")).toBeVisible();
    expect(await within(getTasksTab()).findByText("138")).toBeVisible();
    expect(getCountCalls()).toHaveLength(2);
    await switchToTasks();
    expect(getCountCalls()).toHaveLength(2);
  });
});
