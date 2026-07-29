import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupTaskRunsEndpoints } from "__support__/server-mocks";
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
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import type { ListTaskRunsResponse } from "metabase-types/api";
import { createMockTaskRun } from "metabase-types/api/mocks";

import { TaskRunsPage } from "./TaskRunsPage";

const PATHNAME = Urls.monitorTasksRuns();

interface SetupOpts {
  taskRunsResponse?: ListTaskRunsResponse;
  error?: boolean;
  initialRoute?: string;
}

const setup = ({
  taskRunsResponse = createMockTaskRunsResponse(),
  error,
  initialRoute = PATHNAME,
}: SetupOpts = {}) => {
  if (error) {
    fetchMock.get("path:/api/task/runs", { status: 500 });
  } else {
    setupTaskRunsEndpoints(taskRunsResponse);
  }

  mockGetBoundingClientRect({ width: 100, height: 100 });

  return renderWithProviders(
    <Route path={PATHNAME} element={<TaskRunsPage />}>
      <Route path=":runId" />
    </Route>,
    {
      initialRoute,
      withRouter: true,
    },
  );
};

const getLastRunsParams = () => {
  const calls = fetchMock.callHistory.calls("path:/api/task/runs");
  const lastCall = calls[calls.length - 1];
  return new URL(lastCall.url).searchParams;
};

const openDatePicker = async () => {
  await userEvent.click(screen.getByTestId("task-run-date-picker"));
};

const selectRange = async (label: string) => {
  await userEvent.click(screen.getByPlaceholderText("Started at"));
  await userEvent.click(await screen.findByRole("option", { name: label }));
};

describe("TaskRunsPage", () => {
  it("should display formatted datetime for started_at and ended_at", async () => {
    setup({
      taskRunsResponse: createMockTaskRunsResponse({
        data: [
          createMockTaskRun({
            started_at: "2023-03-04T01:45:26.005475-08:00",
            ended_at: "2023-03-04T01:46:26.518597-08:00",
          }),
        ],
      }),
    });

    const startedAtElement = await screen.findByTestId("started-at");
    const endedAtElement = screen.getByTestId("ended-at");
    expect(startedAtElement).toHaveTextContent("March 4, 2023, 1:45 AM");
    expect(endedAtElement).toHaveTextContent("March 4, 2023, 1:46 AM");
  });

  it("should show raw ISO timestamp in tooltip on hover", async () => {
    const rawTimestamp = "2023-03-04T01:45:26.005475-08:00";
    setup({
      taskRunsResponse: createMockTaskRunsResponse({
        data: [
          createMockTaskRun({
            started_at: rawTimestamp,
            ended_at: "2023-03-04T01:46:26.518597-08:00",
          }),
        ],
      }),
    });

    const startedAtElement = await screen.findByTestId("started-at");
    await userEvent.hover(startedAtElement);

    expect(await screen.findByRole("tooltip")).toHaveTextContent(rawTimestamp);
  });

  it("should show the total results count below the table", async () => {
    setup({
      taskRunsResponse: createMockTaskRunsResponse({
        data: [createMockTaskRun()],
        total: 75,
        limit: 50,
        offset: 0,
      }),
    });
    await waitForLoaderToBeRemoved();

    const pagination = screen.getByRole("navigation", { name: "pagination" });
    expect(
      within(pagination).getByTestId("pagination-total"),
    ).toHaveTextContent("75");
    expect(pagination).toHaveTextContent("1 - 1");
  });

  it("should navigate to run details when a row is clicked", async () => {
    const { history } = setup({
      taskRunsResponse: createMockTaskRunsResponse({
        data: [createMockTaskRun({ id: 55 })],
      }),
    });

    const row = await screen.findByTestId("task-run");
    await userEvent.click(row);

    expect(history?.getCurrentLocation().pathname).toBe(
      Urls.monitorTaskRunDetails(55),
    );
  });

  describe("sorting", () => {
    beforeEach(() => {
      jest.useFakeTimers({ advanceTimers: true });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("requests the default sorting", async () => {
      setup();

      await waitFor(() => {
        expect(fetchMock.callHistory.calls("path:/api/task/runs")).toHaveLength(
          1,
        );
      });

      const params = getLastRunsParams();
      expect(params.get("sort-column")).toBe("started_at");
      expect(params.get("sort-direction")).toBe("desc");
    });

    it("accepts sorting query params", async () => {
      setup({
        initialRoute: `${PATHNAME}?sort_column=task_count&sort_direction=asc`,
      });

      await waitFor(() => {
        expect(fetchMock.callHistory.calls("path:/api/task/runs")).toHaveLength(
          1,
        );
      });

      const params = getLastRunsParams();
      expect(params.get("sort-column")).toBe("task_count");
      expect(params.get("sort-direction")).toBe("asc");
    });

    it("sorts by each sortable column", async () => {
      const { history } = setup({
        taskRunsResponse: createMockTaskRunsResponse({
          data: [createMockTaskRun()],
        }),
      });

      await waitFor(() => {
        expect(fetchMock.callHistory.calls("path:/api/task/runs")).toHaveLength(
          1,
        );
      });

      const cases: { header: RegExp; column: string }[] = [
        { header: /Run Type/, column: "run_type" },
        { header: /Entity/, column: "entity_name" },
        { header: /Ended at/, column: "ended_at" },
        { header: /Status/, column: "status" },
        { header: /Task Count/, column: "task_count" },
      ];

      for (const { header, column } of cases) {
        const columnHeader = screen.getByRole("columnheader", { name: header });
        await userEvent.click(columnHeader);

        await waitFor(() => {
          expect(
            screen.getByRole("columnheader", { name: header }),
          ).toHaveAttribute("aria-sort", "ascending");
        });
        const params = getLastRunsParams();
        expect(params.get("sort-column")).toBe(column);
        expect(params.get("sort-direction")).toBe("asc");
        act(() => {
          jest.advanceTimersByTime(URL_UPDATE_DEBOUNCE_DELAY);
        });
        expect(history?.getCurrentLocation().search).toEqual(
          `?sort_column=${column}&sort_direction=asc`,
        );
      }
    });

    it("toggles sort direction when clicking the active sorted column", async () => {
      const { history } = setup({
        taskRunsResponse: createMockTaskRunsResponse({
          data: [createMockTaskRun()],
        }),
      });

      const startedAtHeader = await screen.findByRole("columnheader", {
        name: /Started at/,
      });
      expect(startedAtHeader).toHaveAttribute("aria-sort", "descending");

      await userEvent.click(startedAtHeader);
      await waitFor(() => {
        expect(
          screen.getByRole("columnheader", { name: /Started at/ }),
        ).toHaveAttribute("aria-sort", "ascending");
      });
      expect(getLastRunsParams().get("sort-direction")).toBe("asc");
      act(() => {
        jest.advanceTimersByTime(URL_UPDATE_DEBOUNCE_DELAY);
      });
      expect(history?.getCurrentLocation().search).toEqual(
        "?sort_direction=asc",
      );

      await userEvent.click(
        screen.getByRole("columnheader", { name: /Started at/ }),
      );
      await waitFor(() => {
        expect(
          screen.getByRole("columnheader", { name: /Started at/ }),
        ).toHaveAttribute("aria-sort", "descending");
      });
      expect(getLastRunsParams().get("sort-direction")).toBe("desc");
      act(() => {
        jest.advanceTimersByTime(URL_UPDATE_DEBOUNCE_DELAY);
      });
      expect(history?.getCurrentLocation().search).toEqual("");
    });

    it("resets pagination on sorting change", async () => {
      const { history } = setup({
        taskRunsResponse: createMockTaskRunsResponse({
          data: [createMockTaskRun()],
          total: 75,
          limit: 50,
          offset: 0,
        }),
      });

      await waitFor(() => {
        expect(fetchMock.callHistory.calls("path:/api/task/runs")).toHaveLength(
          1,
        );
      });

      const nextPage = await screen.findByRole("button", { name: "Next page" });
      await userEvent.click(nextPage);

      await waitFor(() => {
        expect(getLastRunsParams().get("offset")).toBe("50");
      });
      act(() => {
        jest.advanceTimersByTime(URL_UPDATE_DEBOUNCE_DELAY);
      });
      expect(history?.getCurrentLocation().search).toEqual("?page=1");

      await userEvent.click(
        screen.getByRole("columnheader", { name: /Run Type/ }),
      );

      await waitFor(() => {
        expect(getLastRunsParams().get("offset")).toBe("0");
      });
      expect(getLastRunsParams().get("sort-column")).toBe("run_type");
      act(() => {
        jest.advanceTimersByTime(URL_UPDATE_DEBOUNCE_DELAY);
      });
      expect(history?.getCurrentLocation().search).toEqual(
        "?sort_column=run_type&sort_direction=asc",
      );
    });
  });

  describe("started-at filter with include-today", () => {
    it("requests with the ~ suffix when today is included", async () => {
      setup();
      await waitForLoaderToBeRemoved();

      await openDatePicker();
      await selectRange("Previous week");

      await waitFor(() => {
        expect(getLastRunsParams().get("started-at")).toBe("past1weeks");
      });

      await userEvent.click(
        screen.getByRole("switch", { name: "Include today" }),
      );

      await waitFor(() => {
        expect(getLastRunsParams().get("started-at")).toBe("past1weeks~");
      });
    });

    it("keeps the selected entity when only include-today changes", async () => {
      setup({
        initialRoute: `${PATHNAME}?run-type=alert&started-at=past1weeks&entity-type=card&entity-id=42`,
      });
      await waitForLoaderToBeRemoved();

      await openDatePicker();
      await userEvent.click(
        screen.getByRole("switch", { name: "Include today" }),
      );

      await waitFor(() => {
        const params = getLastRunsParams();
        expect(params.get("started-at")).toBe("past1weeks~");
        expect(params.get("entity-type")).toBe("card");
        expect(params.get("entity-id")).toBe("42");
      });
    });

    it("clears the selected entity when the range changes", async () => {
      setup({
        initialRoute: `${PATHNAME}?run-type=alert&started-at=past1weeks&entity-type=card&entity-id=42`,
      });
      await waitForLoaderToBeRemoved();

      await openDatePicker();
      await selectRange("Previous 30 days");

      await waitFor(() => {
        const params = getLastRunsParams();
        expect(params.get("started-at")).toBe("past30days");
        expect(params.get("entity-type")).toBeNull();
        expect(params.get("entity-id")).toBeNull();
      });
    });

    it("restores the include-today filter from the URL", async () => {
      setup({
        initialRoute: `${PATHNAME}?started-at=past1weeks&include-today=true`,
      });
      await waitForLoaderToBeRemoved();

      expect(
        screen.getByText("Previous week, including today"),
      ).toBeInTheDocument();
      expect(getLastRunsParams().get("started-at")).toBe("past1weeks~");
    });

    it("does not append the ~ suffix for a this* range", async () => {
      setup({
        initialRoute: `${PATHNAME}?started-at=thisday&include-today=true`,
      });
      await waitForLoaderToBeRemoved();

      expect(getLastRunsParams().get("started-at")).toBe("thisday");
    });
  });

  describe("entity filter", () => {
    it("ignores a lone entity-id without a matching entity-type", async () => {
      setup({
        initialRoute: `${PATHNAME}?entity-id=5`,
      });
      await waitForLoaderToBeRemoved();

      const params = getLastRunsParams();
      expect(params.get("entity-id")).toBeNull();
      expect(params.get("entity-type")).toBeNull();
    });

    it("ignores a lone entity-type without a matching entity-id", async () => {
      setup({
        initialRoute: `${PATHNAME}?entity-type=card`,
      });
      await waitForLoaderToBeRemoved();

      const params = getLastRunsParams();
      expect(params.get("entity-id")).toBeNull();
      expect(params.get("entity-type")).toBeNull();
    });

    it("forwards the entity pair when both are present", async () => {
      setup({
        initialRoute: `${PATHNAME}?entity-type=card&entity-id=5`,
      });
      await waitForLoaderToBeRemoved();

      const params = getLastRunsParams();
      expect(params.get("entity-type")).toBe("card");
      expect(params.get("entity-id")).toBe("5");
    });
  });
});

function createMockTaskRunsResponse(
  response?: Partial<ListTaskRunsResponse>,
): ListTaskRunsResponse {
  return {
    data: [],
    limit: 0,
    offset: 0,
    total: 0,
    ...response,
  };
}
