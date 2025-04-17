import fetchMock from "fetch-mock";
import type { Location } from "history";

import {
  setupDatabasesEndpoints,
  setupTasksEndpoints,
  setupUniqueTasksEndpoint,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { Route } from "metabase/hoc/Title";
import type { Task } from "metabase-types/api";
import { createMockTask } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockLocation } from "metabase-types/store/mocks";

import { TasksApp } from "./TasksApp";

interface SetupOpts {
  error?: boolean;
  location?: Location;
  tasks?: Task[];
}

const PATHNAME = "/admin/troubleshooting/tasks";

const setup = ({
  error,
  location = createMockLocation({
    pathname: PATHNAME,
  }),
  tasks = [],
}: SetupOpts = {}) => {
  setupDatabasesEndpoints([createSampleDatabase()]);
  setupUniqueTasksEndpoint(["task-a", "task-b"]);

  if (error) {
    fetchMock.get("path:/api/task", { status: 500 });
  } else {
    setupTasksEndpoints(tasks);
  }

  return renderWithProviders(<Route path={PATHNAME} component={TasksApp} />, {
    initialRoute: `${location.pathname}${location.search}`,
    withRouter: true,
  });
};

describe("TasksApp", () => {
  it("should show loading and empty state", async () => {
    setup({ tasks: [] });

    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    await waitForLoaderToBeRemoved();
    expect(screen.getByText("No results")).toBeInTheDocument();
  });

  it("should show loading and results state", async () => {
    setup({ tasks: [createMockTask()] });

    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    await waitForLoaderToBeRemoved();
    expect(screen.queryByText("No results")).not.toBeInTheDocument();
    expect(screen.getByText("A task")).toBeInTheDocument();
  });

  it("should show error state", async () => {
    setup({ error: true });

    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    await waitForLoaderToBeRemoved();
    expect(screen.queryByText("No results")).not.toBeInTheDocument();
    expect(screen.queryByText("A task")).not.toBeInTheDocument();
    expect(screen.getByText("An error occurred")).toBeInTheDocument();
  });
});
