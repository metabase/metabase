import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import type { Location } from "history";

import {
  setupDatabasesEndpoints,
  setupTasksEndpoints,
  setupUniqueTasksEndpoint,
} from "__support__/server-mocks";
import {
  act,
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { URL_UPDATE_DEBOUNCE_DELAY } from "metabase/common/hooks/use-url-state";
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
    setupTasksEndpoints(tasksResponse, { delay: 10 });
  }

  return renderWithProviders(<Route path={PATHNAME} component={TasksApp} />, {
    initialRoute: `${location.pathname}${location.search}`,
    withRouter: true,
  });
};

describe("TasksApp", () => {
  beforeEach(() => {
    jest.useFakeTimers({ advanceTimers: true });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

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

    expect(fetchMock.calls("path:/api/task").map(([url]) => url)).toEqual([
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc",
    ]);
    await waitForLoaderToBeRemoved();

    const previousPage = screen.getByRole("button", { name: "Previous page" });
    const nextPage = screen.getByRole("button", { name: "Next page" });

    expect(previousPage).toBeDisabled();
    expect(nextPage).toBeEnabled();
    expect(history?.getCurrentLocation().search).toEqual("");

    await userEvent.click(nextPage);

    expect(fetchMock.calls("path:/api/task").map(([url]) => url)).toEqual([
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc",
      "http://localhost/api/task?limit=50&offset=50&sort_column=started_at&sort_direction=desc",
    ]);
    await waitForLoaderToBeRemoved();
    expect(history?.getCurrentLocation().search).toEqual("");
    act(() => {
      jest.advanceTimersByTime(URL_UPDATE_DEBOUNCE_DELAY);
    });

    expect(previousPage).toBeEnabled();
    expect(nextPage).toBeDisabled();
    expect(history?.getCurrentLocation().search).toEqual("?page=1");

    await userEvent.click(previousPage);

    expect(fetchMock.calls("path:/api/task").map(([url]) => url)).toEqual([
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc",
      "http://localhost/api/task?limit=50&offset=50&sort_column=started_at&sort_direction=desc",
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc",
    ]);
    expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();
    expect(history?.getCurrentLocation().search).toEqual("?page=1");
    act(() => {
      jest.advanceTimersByTime(URL_UPDATE_DEBOUNCE_DELAY);
    });

    expect(previousPage).toBeDisabled();
    expect(nextPage).toBeEnabled();
    expect(history?.getCurrentLocation().search).toEqual("");
  });

  it("should reset pagination on task filter change", async () => {
    const { history } = setup({
      tasksResponse: createMockTasksResponse({
        total: 75,
        limit: 50,
        offset: 0,
      }),
    });

    expect(fetchMock.calls("path:/api/task").map(([url]) => url)).toEqual([
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc",
    ]);
    await waitForLoaderToBeRemoved();

    const previousPage = screen.getByRole("button", { name: "Previous page" });
    const nextPage = screen.getByRole("button", { name: "Next page" });
    const taskPicker = screen.getByPlaceholderText("Filter by task");

    await userEvent.click(nextPage);
    expect(fetchMock.calls("path:/api/task").map(([url]) => url)).toEqual([
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc",
      "http://localhost/api/task?limit=50&offset=50&sort_column=started_at&sort_direction=desc",
    ]);
    act(() => {
      jest.advanceTimersByTime(URL_UPDATE_DEBOUNCE_DELAY);
    });
    expect(history?.getCurrentLocation().search).toEqual("?page=1");

    await userEvent.click(taskPicker);
    const taskPopover = screen.getByRole("listbox");
    await userEvent.click(within(taskPopover).getByText("task-b"));

    expect(fetchMock.calls("path:/api/task").map(([url]) => url)).toEqual([
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc",
      "http://localhost/api/task?limit=50&offset=50&sort_column=started_at&sort_direction=desc",
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc&task=task-b",
    ]);
    expect(previousPage).toBeDisabled();
    expect(nextPage).toBeEnabled();
    act(() => {
      jest.advanceTimersByTime(URL_UPDATE_DEBOUNCE_DELAY);
    });
    expect(history?.getCurrentLocation().search).toEqual("?task=task-b");
  });

  it("should reset pagination on task status filter change", async () => {
    const { history } = setup({
      tasksResponse: createMockTasksResponse({
        total: 75,
        limit: 50,
        offset: 0,
      }),
    });

    expect(fetchMock.calls("path:/api/task").map(([url]) => url)).toEqual([
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc",
    ]);
    await waitForLoaderToBeRemoved();

    const previousPage = screen.getByRole("button", { name: "Previous page" });
    const nextPage = screen.getByRole("button", { name: "Next page" });
    const taskStatusPicker = screen.getByPlaceholderText("Filter by status");

    await userEvent.click(nextPage);
    expect(fetchMock.calls("path:/api/task").map(([url]) => url)).toEqual([
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc",
      "http://localhost/api/task?limit=50&offset=50&sort_column=started_at&sort_direction=desc",
    ]);
    act(() => {
      jest.advanceTimersByTime(URL_UPDATE_DEBOUNCE_DELAY);
    });
    expect(history?.getCurrentLocation().search).toEqual("?page=1");

    await userEvent.click(taskStatusPicker);
    const taskStatusPopover = screen.getByRole("listbox");
    await userEvent.click(within(taskStatusPopover).getByText("Success"));

    expect(fetchMock.calls("path:/api/task").map(([url]) => url)).toEqual([
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc",
      "http://localhost/api/task?limit=50&offset=50&sort_column=started_at&sort_direction=desc",
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc&status=success",
    ]);
    expect(previousPage).toBeDisabled();
    expect(nextPage).toBeEnabled();
    act(() => {
      jest.advanceTimersByTime(URL_UPDATE_DEBOUNCE_DELAY);
    });
    expect(history?.getCurrentLocation().search).toEqual("?status=success");
  });

  it("should reset pagination on sorting change", async () => {
    const { history } = setup({
      tasksResponse: createMockTasksResponse({
        total: 75,
        limit: 50,
        offset: 0,
      }),
    });

    expect(fetchMock.calls("path:/api/task").map(([url]) => url)).toEqual([
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc",
    ]);
    await waitForLoaderToBeRemoved();

    const previousPage = screen.getByRole("button", { name: "Previous page" });
    const nextPage = screen.getByRole("button", { name: "Next page" });
    const startedAtHeader = screen.getByRole("button", {
      name: /Started at/,
    });

    await userEvent.click(nextPage);
    expect(fetchMock.calls("path:/api/task").map(([url]) => url)).toEqual([
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc",
      "http://localhost/api/task?limit=50&offset=50&sort_column=started_at&sort_direction=desc",
    ]);
    act(() => {
      jest.advanceTimersByTime(URL_UPDATE_DEBOUNCE_DELAY);
    });
    expect(history?.getCurrentLocation().search).toEqual("?page=1");

    await userEvent.click(startedAtHeader);

    expect(fetchMock.calls("path:/api/task").map(([url]) => url)).toEqual([
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc",
      "http://localhost/api/task?limit=50&offset=50&sort_column=started_at&sort_direction=desc",
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=asc",
    ]);
    expect(previousPage).toBeDisabled();
    expect(nextPage).toBeEnabled();
    act(() => {
      jest.advanceTimersByTime(URL_UPDATE_DEBOUNCE_DELAY);
    });
    expect(history?.getCurrentLocation().search).toEqual("?sort_direction=asc");
  });

  it("should allow to filter tasks list", async () => {
    const { history } = setup();

    expect(fetchMock.calls("path:/api/task").map(([url]) => url)).toEqual([
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc",
    ]);
    await waitForLoaderToBeRemoved();

    const taskPicker = screen.getByPlaceholderText("Filter by task");
    const taskStatusPicker = screen.getByPlaceholderText("Filter by status");

    expect(taskPicker).toBeInTheDocument();
    expect(taskPicker).toHaveValue("");
    expect(taskStatusPicker).toBeInTheDocument();
    expect(taskStatusPicker).toHaveValue("");

    await userEvent.click(taskPicker);

    const taskPopover = screen.getByRole("listbox");

    expect(taskPopover).toBeInTheDocument();
    expect(within(taskPopover).getByText("task-a")).toBeInTheDocument();
    expect(within(taskPopover).getByText("task-b")).toBeInTheDocument();

    await userEvent.click(within(taskPopover).getByText("task-b"));

    expect(taskPicker).toHaveValue("task-b");
    expect(fetchMock.calls("path:/api/task").map(([url]) => url)).toEqual([
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc",
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc&task=task-b",
    ]);
    await waitForLoaderToBeRemoved();
    expect(history?.getCurrentLocation().search).toEqual("");
    act(() => {
      jest.advanceTimersByTime(URL_UPDATE_DEBOUNCE_DELAY);
    });
    expect(history?.getCurrentLocation().search).toEqual("?task=task-b");

    await userEvent.click(taskStatusPicker);

    const taskStatusPopover = screen.getByRole("listbox");

    expect(taskStatusPopover).toBeInTheDocument();
    expect(within(taskStatusPopover).getByText("Failed")).toBeInTheDocument();
    expect(within(taskStatusPopover).getByText("Started")).toBeInTheDocument();
    expect(within(taskStatusPopover).getByText("Success")).toBeInTheDocument();
    expect(within(taskStatusPopover).getByText("Unknown")).toBeInTheDocument();

    await userEvent.click(within(taskStatusPopover).getByText("Success"));

    expect(taskStatusPicker).toHaveValue("Success");
    expect(fetchMock.calls("path:/api/task").map(([url]) => url)).toEqual([
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc",
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc&task=task-b",
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc&status=success&task=task-b",
    ]);
    await waitForLoaderToBeRemoved();
    expect(history?.getCurrentLocation().search).toEqual("?task=task-b");
    act(() => {
      jest.advanceTimersByTime(URL_UPDATE_DEBOUNCE_DELAY);
    });
    expect(history?.getCurrentLocation().search).toEqual(
      "?status=success&task=task-b",
    );

    const clearTaskButton = screen.getAllByLabelText("Clear")[0];
    await userEvent.click(clearTaskButton);

    expect(taskPicker).toHaveValue("");
    expect(fetchMock.calls("path:/api/task").map(([url]) => url)).toEqual([
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc",
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc&task=task-b",
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc&status=success&task=task-b",
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc&status=success",
    ]);
    await waitForLoaderToBeRemoved();
    act(() => {
      jest.advanceTimersByTime(URL_UPDATE_DEBOUNCE_DELAY);
    });
    expect(history?.getCurrentLocation().search).toEqual("?status=success");
    const clearTaskStatusButton = screen.getByLabelText("Clear");

    await userEvent.click(clearTaskStatusButton);

    expect(taskStatusPicker).toHaveValue("");
    expect(fetchMock.calls("path:/api/task").map(([url]) => url)).toEqual([
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc",
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc&task=task-b",
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc&status=success&task=task-b",
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc&status=success",
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc",
    ]);
    expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();
    expect(history?.getCurrentLocation().search).toEqual("?status=success");
    act(() => {
      jest.advanceTimersByTime(URL_UPDATE_DEBOUNCE_DELAY);
    });
    expect(history?.getCurrentLocation().search).toEqual("");
  });

  it("should allow to sort tasks list", async () => {
    const { history } = setup();

    expect(fetchMock.calls("path:/api/task").map(([url]) => url)).toEqual([
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc",
    ]);
    await waitForLoaderToBeRemoved();

    const startedAtHeader = screen.getByRole("button", { name: /Started at/ });
    const endedAtHeader = screen.getByRole("button", { name: /Ended at/ });
    const durationHeader = screen.getByRole("button", { name: /Duration/ });

    expect(startedAtHeader).toBeInTheDocument();
    expect(endedAtHeader).toBeInTheDocument();
    expect(durationHeader).toBeInTheDocument();
    expect(
      within(startedAtHeader).getByRole("img", { name: "chevrondown icon" }),
    ).toBeInTheDocument();
    expect(history?.getCurrentLocation().search).toEqual("");

    await userEvent.click(startedAtHeader);

    expect(
      within(startedAtHeader).getByRole("img", { name: "chevronup icon" }),
    ).toBeInTheDocument();
    expect(fetchMock.calls("path:/api/task").map(([url]) => url)).toEqual([
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc",
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=asc",
    ]);
    act(() => {
      jest.advanceTimersByTime(URL_UPDATE_DEBOUNCE_DELAY);
    });
    expect(history?.getCurrentLocation().search).toEqual("?sort_direction=asc");

    await userEvent.click(endedAtHeader);

    expect(
      within(endedAtHeader).getByRole("img", { name: "chevronup icon" }),
    ).toBeInTheDocument();
    expect(fetchMock.calls("path:/api/task").map(([url]) => url)).toEqual([
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc",
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=asc",
      "http://localhost/api/task?limit=50&offset=0&sort_column=ended_at&sort_direction=asc",
    ]);
    act(() => {
      jest.advanceTimersByTime(URL_UPDATE_DEBOUNCE_DELAY);
    });
    expect(history?.getCurrentLocation().search).toEqual(
      "?sort_column=ended_at&sort_direction=asc",
    );

    await userEvent.click(durationHeader);

    expect(
      within(durationHeader).getByRole("img", { name: "chevronup icon" }),
    ).toBeInTheDocument();
    expect(fetchMock.calls("path:/api/task").map(([url]) => url)).toEqual([
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc",
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=asc",
      "http://localhost/api/task?limit=50&offset=0&sort_column=ended_at&sort_direction=asc",
      "http://localhost/api/task?limit=50&offset=0&sort_column=duration&sort_direction=asc",
    ]);
    act(() => {
      jest.advanceTimersByTime(URL_UPDATE_DEBOUNCE_DELAY);
    });
    expect(history?.getCurrentLocation().search).toEqual(
      "?sort_column=duration&sort_direction=asc",
    );
  });

  it("accepts task query param", async () => {
    setup({
      location: createMockLocation({
        pathname: PATHNAME,
        search: "?task=task-b",
      }),
    });

    expect(fetchMock.calls("path:/api/task").map(([url]) => url)).toEqual([
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc&task=task-b",
    ]);
    await waitForLoaderToBeRemoved();

    const taskPicker = screen.getByPlaceholderText("Filter by task");

    expect(taskPicker).toBeInTheDocument();
    expect(taskPicker).toHaveValue("task-b");
  });

  it("accepts status query param", async () => {
    setup({
      location: createMockLocation({
        pathname: PATHNAME,
        search: "?status=success",
      }),
    });

    expect(fetchMock.calls("path:/api/task").map(([url]) => url)).toEqual([
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc&status=success",
    ]);
    await waitForLoaderToBeRemoved();

    const taskStatusPicker = screen.getByPlaceholderText("Filter by status");

    expect(taskStatusPicker).toBeInTheDocument();
    expect(taskStatusPicker).toHaveValue("Success");
  });

  it("accepts sorting query params", async () => {
    setup({
      location: createMockLocation({
        pathname: PATHNAME,
        search: "?sort_column=duration&sort_direction=asc",
      }),
    });

    expect(fetchMock.calls("path:/api/task").map(([url]) => url)).toEqual([
      "http://localhost/api/task?limit=50&offset=0&sort_column=duration&sort_direction=asc",
    ]);
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
