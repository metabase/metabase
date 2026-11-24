import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDatabasesEndpoints,
  setupTaskEndpoint,
  setupTaskRunEndpoint,
  setupTaskRunsEndpoints,
  setupTasksEndpoints,
  setupUniqueTasksEndpoint,
} from "__support__/server-mocks";
import {
  act,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  within,
} from "__support__/ui";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import {
  createMockTask,
  createMockTaskRun,
  createMockTaskRunExtended,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { getTasksRoutes } from "./routes";

describe("task runs navigation", () => {
  const listedRun = createMockTaskRun({ id: 1, entity_name: "Other Database" });
  const clickedRun = createMockTaskRun({
    id: 2,
    run_type: "sync",
    entity_type: "database",
    entity_id: 1,
    entity_name: "Sample Database",
    task_count: 3,
    success_count: 2,
    failed_count: 1,
  });
  const taskRun = createMockTaskRunExtended({
    ...clickedRun,
    tasks: [
      createMockTask({ id: 101, task: "sync-database", run_id: 2 }),
      createMockTask({ id: 102, task: "analyze", run_id: 2 }),
      createMockTask({
        id: 103,
        task: "fingerprint",
        status: "failed",
        run_id: 2,
      }),
    ],
  });

  function setupRuns(initialRoute: string) {
    setupTasksEndpoints({
      data: [createMockTask({ id: 50, task: "listed task" })],
      total: 1,
      limit: 25,
      offset: 0,
    });
    setupTaskRunsEndpoints({
      data: [listedRun, clickedRun],
      total: 2,
      limit: 25,
      offset: 0,
    });
    // only the clicked run and task respond, other ids hit unmocked routes
    setupTaskRunEndpoint(taskRun);
    setupTaskEndpoint(taskRun.tasks[1]);
    setupDatabasesEndpoints([createSampleDatabase()]);
    setupUniqueTasksEndpoint([]);
    mockGetBoundingClientRect({ width: 100, height: 100 });

    return renderWithProviders(
      <>
        <Route path={Urls.monitorTasks()}>{getTasksRoutes()}</Route>
        <Route
          path="/admin/databases/:databaseId"
          element={<div data-testid="database-page" />}
        />
      </>,
      { withRouter: true, initialRoute },
    );
  }

  const getRunCalls = () =>
    fetchMock.callHistory.calls(`path:/api/task/runs/${taskRun.id}`);

  async function expectRunDetails() {
    expect(await screen.findByText("Run type")).toBeVisible();
    expect(screen.getByText("Sync")).toBeVisible();
    expect(screen.getByText("Entity")).toBeVisible();
    expect(screen.getByRole("link", { name: "Sample Database" })).toBeVisible();
    const tasksTable = screen.getByTestId("task-run-tasks-table");
    expect(tasksTable).toBeVisible();
    expect(within(tasksTable).getAllByTestId("task-run-task")).toHaveLength(3);
  }

  it("switches tabs, opens a run and follows its links", async () => {
    const { router } = setupRuns(Urls.monitorTasksList());

    expect(await screen.findByTestId("task")).toHaveTextContent("listed task");

    await userEvent.click(screen.getByRole("link", { name: "Runs" }));
    expect(router?.location.pathname).toBe(Urls.monitorTasksRuns());
    const runsTable = await screen.findByTestId("task-runs-table");
    const runRow = await within(runsTable).findByRole("row", {
      name: /Sample Database/,
    });

    await userEvent.click(runRow);
    expect(router?.location.pathname).toBe(
      Urls.monitorTaskRunDetails(taskRun.id),
    );
    await expectRunDetails();
    expect(getRunCalls()).toHaveLength(1);

    // an associated task row opens the task details
    const tasksTable = screen.getByTestId("task-run-tasks-table");
    await userEvent.click(
      within(tasksTable).getByRole("row", { name: /analyze/ }),
    );
    expect(router?.location.pathname).toBe(Urls.monitorTaskDetails(102));
    expect(await screen.findByText("Task details")).toBeVisible();
    expect(screen.getByText("analyze")).toBeVisible();

    act(() => router?.back());
    expect(router?.location.pathname).toBe(
      Urls.monitorTaskRunDetails(taskRun.id),
    );
    await expectRunDetails();

    // the entity link opens the database
    await userEvent.click(
      screen.getByRole("link", { name: "Sample Database" }),
    );
    expect(router?.location.pathname).toBe("/admin/databases/1");
    expect(await screen.findByTestId("database-page")).toBeInTheDocument();

    act(() => router?.back());
    expect(router?.location.pathname).toBe(
      Urls.monitorTaskRunDetails(taskRun.id),
    );
    await expectRunDetails();

    await userEvent.click(screen.getByRole("link", { name: /Back to Runs/ }));
    expect(router?.location.pathname).toBe(Urls.monitorTasksRuns());
    expect(await screen.findByTestId("task-runs-table")).toBeVisible();

    await userEvent.click(screen.getByRole("link", { name: "Tasks" }));
    expect(router?.location.pathname).toBe(Urls.monitorTasksList());
    expect(await screen.findByTestId("task")).toHaveTextContent("listed task");
  });

  it("fetches the run on a cold load of its details page", async () => {
    setupRuns(Urls.monitorTaskRunDetails(taskRun.id));

    await expectRunDetails();
    expect(getRunCalls()).toHaveLength(1);
  });
});
