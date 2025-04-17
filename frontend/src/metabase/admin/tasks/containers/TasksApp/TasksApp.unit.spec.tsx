import userEvent from "@testing-library/user-event";
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
import type { ListTasksResponse } from "metabase-types/api";
import { createMockTask } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockLocation } from "metabase-types/store/mocks";

import { TasksApp } from "./TasksApp";

interface SetupOpts {
  error?: boolean;
  location?: Location;
  tasksResponse?: ListTasksResponse;
}

const PATHNAME = "/admin/troubleshooting/tasks";

const setup = ({
  error,
  location = createMockLocation({
    pathname: PATHNAME,
  }),
  tasksResponse = createMockTasksResponse(),
}: SetupOpts = {}) => {
  setupDatabasesEndpoints([createSampleDatabase()]);
  setupUniqueTasksEndpoint(["task-a", "task-b"]);

  if (error) {
    fetchMock.get("path:/api/task", { status: 500 });
  } else {
    setupTasksEndpoints(tasksResponse);
  }

  return renderWithProviders(<Route path={PATHNAME} component={TasksApp} />, {
    initialRoute: `${location.pathname}${location.search}`,
    withRouter: true,
  });
};

describe("TasksApp", () => {
  it("should show loading and empty state", async () => {
    setup();

    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    await waitForLoaderToBeRemoved();
    expect(screen.getByText("No results")).toBeInTheDocument();
  });

  it("should show loading and results state", async () => {
    setup({
      tasksResponse: createMockTasksResponse({ data: [createMockTask()] }),
    });

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

  it("should not show pagination controls if there's only 1 page", async () => {
    setup();

    await waitForLoaderToBeRemoved();
    expect(
      screen.queryByRole("button", { name: "Previous page" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Next page" }),
    ).not.toBeInTheDocument();
  });

  it("should have working pagination controls if there's more than 1 page", async () => {
    const { history } = setup({
      tasksResponse: createMockTasksResponse({
        total: 75,
        limit: 50,
        offset: 0,
      }),
    });

    await waitForLoaderToBeRemoved();

    const previousPage = screen.getByRole("button", { name: "Previous page" });
    const nextPage = screen.getByRole("button", { name: "Next page" });

    expect(previousPage).toBeDisabled();
    expect(nextPage).toBeEnabled();
    expect(history?.getCurrentLocation().search).toEqual("");

    await userEvent.click(nextPage);

    expect(previousPage).toBeEnabled();
    expect(nextPage).toBeDisabled();
    expect(history?.getCurrentLocation().search).toEqual("?page=1");

    await userEvent.click(previousPage);

    expect(previousPage).toBeDisabled();
    expect(nextPage).toBeEnabled();
    expect(history?.getCurrentLocation().search).toEqual("");
  });
});

function createMockTasksResponse(
  response?: Partial<ListTasksResponse>,
): ListTasksResponse {
  return {
    data: [],
    limit: 0,
    offset: 0,
    total: 0,
    ...response,
  };
}
