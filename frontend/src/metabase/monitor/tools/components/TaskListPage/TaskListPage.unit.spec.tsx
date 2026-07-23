import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDatabasesEndpoints,
  setupTasksEndpoints,
  setupUniqueTasksEndpoint,
} from "__support__/server-mocks";
import {
  act,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { URL_UPDATE_DEBOUNCE_DELAY } from "metabase/common/hooks/use-url-state";
import { createMockLocation } from "metabase/redux/store/mocks";
import type { Location } from "metabase/router";
import { Route, withRouteProps } from "metabase/router";
import * as Urls from "metabase/urls";
import type { ListTasksResponse } from "metabase-types/api";
import { createMockTask } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { TaskListPage } from "./TaskListPage";

const RoutedTaskListPage = withRouteProps(TaskListPage);

interface SetupOpts {
  error?: boolean;
  location?: Location;
  tasksResponse?: ListTasksResponse;
}

const PATHNAME = Urls.monitorTasksList();

const setup = ({
  error,
  location = createMockLocation({
    pathname: PATHNAME,
  }),
  tasksResponse = createMockTasksResponse(),
}: SetupOpts = {}) => {
  setupDatabasesEndpoints([createSampleDatabase()]);
  setupUniqueTasksEndpoint(["task-a", "task-b"]);
  mockGetBoundingClientRect({ width: 100, height: 100 });

  if (error) {
    fetchMock.get("path:/api/task", { status: 500 });
  } else {
    setupTasksEndpoints(tasksResponse, { delay: 10 });
  }

  return renderWithProviders(
    <Route path={PATHNAME} element={<RoutedTaskListPage />}>
      <Route path=":taskId" />
    </Route>,
    {
      initialRoute: `${location.pathname}${location.search}`,
      withRouter: true,
    },
  );
};

const getLastTaskCallUrl = () => {
  const calls = fetchMock.callHistory.calls("path:/api/task");
  return calls[calls.length - 1]?.url;
};

describe("TaskListPage", () => {
  beforeEach(() => {
    jest.useFakeTimers({ advanceTimers: true });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should show empty state", async () => {
    setup();

    expect(await screen.findByText("No results")).toBeInTheDocument();
  });

  it("should show results state", async () => {
    setup({
      tasksResponse: createMockTasksResponse({ data: [createMockTask()] }),
    });

    expect(await screen.findByText("A task")).toBeInTheDocument();
    expect(screen.queryByText("No results")).not.toBeInTheDocument();
  });

  it("should show error state", async () => {
    setup({ error: true });

    expect(await screen.findByText("An error occurred")).toBeInTheDocument();
    expect(screen.queryByText("No results")).not.toBeInTheDocument();
    expect(screen.queryByText("A task")).not.toBeInTheDocument();
  });

  it("should not show pagination controls if there's only 1 page", async () => {
    setup();

    await screen.findByText("No results");
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

    await waitFor(() => {
      expect(fetchMock.callHistory.calls("path:/api/task")).toHaveLength(1);
    });

    expect(
      fetchMock.callHistory.calls("path:/api/task").map((call) => call.url),
    ).toEqual([
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc",
    ]);
    const previousPage = await screen.findByRole("button", {
      name: "Previous page",
    });
    const nextPage = screen.getByRole("button", { name: "Next page" });

    expect(previousPage).toBeDisabled();
    expect(nextPage).toBeEnabled();
    expect(history?.getCurrentLocation().search).toEqual("");

    await userEvent.click(nextPage);
    await waitFor(() => {
      expect(fetchMock.callHistory.calls("path:/api/task")).toHaveLength(2);
    });
    expect(
      fetchMock.callHistory.calls("path:/api/task").map((call) => call.url),
    ).toEqual([
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

    expect(
      fetchMock.callHistory.calls("path:/api/task").map((call) => call.url),
    ).toEqual([
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

  it("should show the total results count below the table", async () => {
    setup({
      tasksResponse: createMockTasksResponse({
        data: [createMockTask()],
        total: 75,
        limit: 50,
        offset: 0,
      }),
    });

    await screen.findByText("A task");

    const pagination = screen.getByRole("navigation", { name: "pagination" });
    expect(
      within(pagination).getByTestId("pagination-total"),
    ).toHaveTextContent("75");
    expect(pagination).toHaveTextContent("1 - 1");
  });

  it("should reset pagination on task filter change", async () => {
    const { history } = setup({
      tasksResponse: createMockTasksResponse({
        total: 75,
        limit: 50,
        offset: 0,
      }),
    });

    await waitFor(() => {
      expect(fetchMock.callHistory.calls("path:/api/task")).toHaveLength(1);
    });

    expect(
      fetchMock.callHistory.calls("path:/api/task").map((call) => call.url),
    ).toEqual([
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc",
    ]);
    const previousPage = await screen.findByRole("button", {
      name: "Previous page",
    });
    const nextPage = screen.getByRole("button", { name: "Next page" });
    const taskPicker = screen.getByPlaceholderText("Filter by task");

    await userEvent.click(nextPage);
    expect(
      fetchMock.callHistory.calls("path:/api/task").map((call) => call.url),
    ).toEqual([
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

    expect(
      fetchMock.callHistory.calls("path:/api/task").map((call) => call.url),
    ).toEqual([
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

    await waitFor(() => {
      expect(fetchMock.callHistory.calls("path:/api/task")).toHaveLength(1);
    });

    expect(
      fetchMock.callHistory.calls("path:/api/task").map((call) => call.url),
    ).toEqual([
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc",
    ]);
    const previousPage = await screen.findByRole("button", {
      name: "Previous page",
    });
    const nextPage = screen.getByRole("button", { name: "Next page" });
    const taskStatusPicker = screen.getByPlaceholderText("Filter by status");

    await userEvent.click(nextPage);
    expect(
      fetchMock.callHistory.calls("path:/api/task").map((call) => call.url),
    ).toEqual([
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

    expect(
      fetchMock.callHistory.calls("path:/api/task").map((call) => call.url),
    ).toEqual([
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
        data: [createMockTask()],
        total: 75,
        limit: 50,
        offset: 0,
      }),
    });

    await waitFor(() => {
      expect(fetchMock.callHistory.calls("path:/api/task")).toHaveLength(1);
    });

    expect(
      fetchMock.callHistory.calls("path:/api/task").map((call) => call.url),
    ).toEqual([
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc",
    ]);
    const previousPage = await screen.findByRole("button", {
      name: "Previous page",
    });
    const nextPage = screen.getByRole("button", { name: "Next page" });
    const startedAtHeader = screen.getByRole("columnheader", {
      name: /Started at/,
    });

    await userEvent.click(nextPage);
    expect(
      fetchMock.callHistory.calls("path:/api/task").map((call) => call.url),
    ).toEqual([
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc",
      "http://localhost/api/task?limit=50&offset=50&sort_column=started_at&sort_direction=desc",
    ]);
    act(() => {
      jest.advanceTimersByTime(URL_UPDATE_DEBOUNCE_DELAY);
    });
    expect(history?.getCurrentLocation().search).toEqual("?page=1");

    await userEvent.click(startedAtHeader);

    expect(
      fetchMock.callHistory.calls("path:/api/task").map((call) => call.url),
    ).toEqual([
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

    await waitFor(() => {
      expect(fetchMock.callHistory.calls("path:/api/task")).toHaveLength(1);
    });

    expect(
      fetchMock.callHistory.calls("path:/api/task").map((call) => call.url),
    ).toEqual([
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
    expect(
      fetchMock.callHistory.calls("path:/api/task").map((call) => call.url),
    ).toEqual([
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
    expect(
      fetchMock.callHistory.calls("path:/api/task").map((call) => call.url),
    ).toEqual([
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
    expect(
      fetchMock.callHistory.calls("path:/api/task").map((call) => call.url),
    ).toEqual([
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
    expect(
      fetchMock.callHistory.calls("path:/api/task").map((call) => call.url),
    ).toEqual([
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
    const { history } = setup({
      tasksResponse: createMockTasksResponse({ data: [createMockTask()] }),
    });

    await waitFor(() => {
      expect(fetchMock.callHistory.calls("path:/api/task")).toHaveLength(1);
    });
    expect(getLastTaskCallUrl()).toEqual(
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc",
    );
    const startedAtHeader = await screen.findByRole("columnheader", {
      name: /Started at/,
    });
    expect(startedAtHeader).toHaveAttribute("aria-sort", "descending");
    expect(
      within(startedAtHeader).getByRole("img", { name: "chevrondown icon" }),
    ).toBeInTheDocument();
    expect(history?.getCurrentLocation().search).toEqual("");

    await userEvent.click(startedAtHeader);
    await waitFor(() => {
      expect(
        screen.getByRole("columnheader", { name: /Started at/ }),
      ).toHaveAttribute("aria-sort", "ascending");
    });
    expect(
      within(
        screen.getByRole("columnheader", { name: /Started at/ }),
      ).getByRole("img", { name: "chevronup icon" }),
    ).toBeInTheDocument();
    expect(getLastTaskCallUrl()).toEqual(
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=asc",
    );
    act(() => {
      jest.advanceTimersByTime(URL_UPDATE_DEBOUNCE_DELAY);
    });
    expect(history?.getCurrentLocation().search).toEqual("?sort_direction=asc");

    await userEvent.click(
      screen.getByRole("columnheader", { name: /Started at/ }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole("columnheader", { name: /Started at/ }),
      ).toHaveAttribute("aria-sort", "descending");
    });
    expect(getLastTaskCallUrl()).toEqual(
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc",
    );
    act(() => {
      jest.advanceTimersByTime(URL_UPDATE_DEBOUNCE_DELAY);
    });
    expect(history?.getCurrentLocation().search).toEqual("");

    // every sortable column drives the request and URL state
    const cases: { header: RegExp; column: string }[] = [
      { header: /Ended at/, column: "ended_at" },
      { header: /Duration/, column: "duration" },
      { header: /Task/, column: "task" },
      { header: /DB Name/, column: "db_name" },
      { header: /DB Engine/, column: "db_engine" },
      { header: /Status/, column: "status" },
    ];

    for (const { header, column } of cases) {
      await userEvent.click(screen.getByRole("columnheader", { name: header }));

      await waitFor(() => {
        expect(
          screen.getByRole("columnheader", { name: header }),
        ).toHaveAttribute("aria-sort", "ascending");
      });
      expect(
        within(screen.getByRole("columnheader", { name: header })).getByRole(
          "img",
          { name: "chevronup icon" },
        ),
      ).toBeInTheDocument();
      expect(getLastTaskCallUrl()).toEqual(
        `http://localhost/api/task?limit=50&offset=0&sort_column=${column}&sort_direction=asc`,
      );
      act(() => {
        jest.advanceTimersByTime(URL_UPDATE_DEBOUNCE_DELAY);
      });
      expect(history?.getCurrentLocation().search).toEqual(
        `?sort_column=${column}&sort_direction=asc`,
      );
    }
  });

  it("should navigate to task details when a row is clicked", async () => {
    const { history } = setup({
      tasksResponse: createMockTasksResponse({
        data: [createMockTask({ id: 123 })],
      }),
    });

    const row = await screen.findByTestId("task");
    await userEvent.click(row);

    expect(history?.getCurrentLocation().pathname).toBe(
      Urls.monitorTaskDetails(123),
    );
  });

  it("accepts task query param", async () => {
    setup({
      location: createMockLocation({
        pathname: PATHNAME,
        search: "?task=task-b",
      }),
    });

    await waitFor(() => {
      expect(fetchMock.callHistory.calls("path:/api/task")).toHaveLength(1);
    });

    expect(
      fetchMock.callHistory.calls("path:/api/task").map((call) => call.url),
    ).toEqual([
      "http://localhost/api/task?limit=50&offset=0&sort_column=started_at&sort_direction=desc&task=task-b",
    ]);
    await waitForLoaderToBeRemoved();

    const taskPicker = screen.getByPlaceholderText("Filter by task");

    expect(taskPicker).toBeInTheDocument();
    await waitFor(() => {
      expect(taskPicker).toHaveValue("task-b");
    });
  });

  it("accepts status query param", async () => {
    setup({
      location: createMockLocation({
        pathname: PATHNAME,
        search: "?status=success",
      }),
    });

    await waitFor(() => {
      expect(fetchMock.callHistory.calls("path:/api/task")).toHaveLength(1);
    });

    expect(
      fetchMock.callHistory.calls("path:/api/task").map((call) => call.url),
    ).toEqual([
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

    await waitFor(() => {
      expect(fetchMock.callHistory.calls("path:/api/task")).toHaveLength(1);
    });

    expect(
      fetchMock.callHistory.calls("path:/api/task").map((call) => call.url),
    ).toEqual([
      "http://localhost/api/task?limit=50&offset=0&sort_column=duration&sort_direction=asc",
    ]);
  });

  it("should display formatted datetime for started_at and ended_at", async () => {
    setup({
      tasksResponse: createMockTasksResponse({
        data: [
          createMockTask({
            started_at: "2023-03-04T01:45:26.005475-08:00",
            ended_at: "2023-03-04T01:46:26.518597-08:00",
          }),
        ],
      }),
    });

    const row = await screen.findByTestId("task");
    const startedAtElement = within(row).getByTestId("started-at");
    const endedAtElement = within(row).getByTestId("ended-at");
    expect(startedAtElement).toHaveTextContent("March 4, 2023, 1:45 AM");
    expect(endedAtElement).toHaveTextContent("March 4, 2023, 1:46 AM");
  });

  it("should show raw ISO timestamp in tooltip on hover", async () => {
    const rawTimestamp = "2023-03-04T01:45:26.005475-08:00";
    setup({
      tasksResponse: createMockTasksResponse({
        data: [
          createMockTask({
            started_at: rawTimestamp,
            ended_at: "2023-03-04T01:46:26.518597-08:00",
          }),
        ],
      }),
    });

    const row = await screen.findByTestId("task");
    const startedAtElement = within(row).getByTestId("started-at");
    await userEvent.hover(startedAtElement);

    expect(await screen.findByRole("tooltip")).toHaveTextContent(rawTimestamp);
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
