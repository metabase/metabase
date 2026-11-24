import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupTaskRunsEndpoints } from "__support__/server-mocks";
import {
  act,
  fireEvent,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
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
  initialRoute?: string;
}

const setup = async ({
  taskRunsResponse = createMockTaskRunsResponse({
    data: [createMockTaskRun()],
  }),
  initialRoute = PATHNAME,
}: SetupOpts = {}) => {
  setupTaskRunsEndpoints(taskRunsResponse);

  mockGetBoundingClientRect({ width: 100, height: 100 });

  const utils = renderWithProviders(
    <Route path={PATHNAME} element={<TaskRunsPage />}>
      <Route path=":runId" />
    </Route>,
    {
      initialRoute,
      withRouter: true,
    },
  );

  // One await for the page's async source: a rendered row means the task-runs
  // response has been applied. (The loader is no settle signal — it can mount
  // a tick after render, so waiting for its absence can pass early.)
  await screen.findByTestId("task-run");

  return utils;
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
    await setup({
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
    await setup({
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
    await setup({
      taskRunsResponse: createMockTaskRunsResponse({
        data: [createMockTaskRun()],
        total: 75,
        limit: 50,
        offset: 0,
      }),
    });
    const pagination = screen.getByRole("navigation", { name: "pagination" });
    expect(
      within(pagination).getByTestId("pagination-total"),
    ).toHaveTextContent("75");
    expect(pagination).toHaveTextContent("1 - 1");
  });

  it("should navigate to run details when a row is clicked", async () => {
    const { router } = await setup({
      taskRunsResponse: createMockTaskRunsResponse({
        data: [createMockTaskRun({ id: 55 })],
      }),
    });

    const row = await screen.findByTestId("task-run");
    await userEvent.click(row);

    expect(router?.location.pathname).toBe(Urls.monitorTaskRunDetails(55));
  });

  describe("sorting", () => {
    beforeEach(() => {
      jest.useFakeTimers({ advanceTimers: true });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("requests the default sorting", async () => {
      await setup();

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
      await setup({
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
      const { router } = await setup({
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
        expect(router?.location.search).toEqual(
          `?sort_column=${column}&sort_direction=asc`,
        );
      }
    });

    it("toggles sort direction when clicking the active sorted column", async () => {
      const { router } = await setup({
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
      expect(router?.location.search).toEqual("?sort_direction=asc");

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
      expect(router?.location.search).toEqual("");
    });

    it("resets pagination on sorting change", async () => {
      const { router } = await setup({
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
      expect(router?.location.search).toEqual("?page=1");

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
      expect(router?.location.search).toEqual(
        "?sort_column=run_type&sort_direction=asc",
      );
    });
  });

  describe("started-at filter with include-today", () => {
    it("requests with the ~ suffix when today is included", async () => {
      await setup();

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
      await setup({
        initialRoute: `${PATHNAME}?run-type=alert&started-at=past1weeks&entity-type=card&entity-id=42`,
      });

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
      await setup({
        initialRoute: `${PATHNAME}?run-type=alert&started-at=past1weeks&entity-type=card&entity-id=42`,
      });

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
      await setup({
        initialRoute: `${PATHNAME}?started-at=past1weeks&include-today=true`,
      });

      expect(
        screen.getByText("Previous week, including today"),
      ).toBeInTheDocument();
      expect(getLastRunsParams().get("started-at")).toBe("past1weeks~");
    });

    it("does not append the ~ suffix for a this* range", async () => {
      await setup({
        initialRoute: `${PATHNAME}?started-at=thisday&include-today=true`,
      });

      expect(getLastRunsParams().get("started-at")).toBe("thisday");
    });
  });

  describe("entity filter", () => {
    it("ignores a lone entity-id without a matching entity-type", async () => {
      await setup({
        initialRoute: `${PATHNAME}?entity-id=5`,
      });

      const params = getLastRunsParams();
      expect(params.get("entity-id")).toBeNull();
      expect(params.get("entity-type")).toBeNull();
    });

    it("ignores a lone entity-type without a matching entity-id", async () => {
      await setup({
        initialRoute: `${PATHNAME}?entity-type=card`,
      });

      const params = getLastRunsParams();
      expect(params.get("entity-id")).toBeNull();
      expect(params.get("entity-type")).toBeNull();
    });

    it("forwards the entity pair when both are present", async () => {
      await setup({
        initialRoute: `${PATHNAME}?entity-type=card&entity-id=5`,
      });

      const params = getLastRunsParams();
      expect(params.get("entity-type")).toBe("card");
      expect(params.get("entity-id")).toBe("5");
    });
  });
});

describe("TaskRunsPage pagination", () => {
  const TOTAL = 57;
  const LIMIT = 50;

  const respond = (url: string): ListTaskRunsResponse => {
    const params = new URL(url).searchParams;
    const offset = Number(params.get("offset"));
    const page = offset / LIMIT;
    // one run type per page, so the rows on screen tell the pages apart
    const runType = page === 0 ? "sync" : "fingerprint";
    const length = page === 0 ? LIMIT : page === 1 ? TOTAL - LIMIT : 0;
    const isDefaultQuery =
      params.get("limit") === String(LIMIT) &&
      params.get("sort-column") === "started_at" &&
      params.get("sort-direction") === "desc";

    return createMockTaskRunsResponse({
      data: isDefaultQuery
        ? Array.from({ length }, (_, index) =>
            createMockTaskRun({ id: index + 1, run_type: runType }),
          )
        : [],
      limit: LIMIT,
      offset,
      total: TOTAL,
    });
  };

  const getPagination = () =>
    screen.getByRole("navigation", { name: "pagination" });
  const getTable = () => screen.getByTestId("task-runs-table");
  const expectPage = async (range: string, runType: string) => {
    await waitFor(() => expect(getTable()).toHaveTextContent(runType));
    await waitFor(() => expect(getPagination()).toHaveTextContent(range));
    expect(within(getPagination()).getByText(range)).toBeVisible();
  };

  it("pages through task runs with the page in the URL", async () => {
    fetchMock.get("path:/api/task/runs", ({ url }) => respond(url), {
      delay: 10,
    });
    mockGetBoundingClientRect({ width: 100, height: 100 });
    const { router } = renderWithProviders(
      <Route path={PATHNAME} element={<TaskRunsPage />}>
        <Route path=":runId" />
      </Route>,
      { initialRoute: PATHNAME, withRouter: true },
    );

    await expectPage("1 - 50", "Sync");
    expect(getLastRunsParams().get("offset")).toBe("0");
    expect(router?.location.search).toBe("");
    expect(getTable()).not.toHaveTextContent("Fingerprint");

    expect(
      screen.getByRole("button", { name: "Previous page" }),
    ).toBeDisabled();
    const nextPage = screen.getByRole("button", { name: "Next page" });
    expect(nextPage).toBeEnabled();
    await userEvent.click(nextPage);

    await expectPage("51 - 57", "Fingerprint");
    expect(getLastRunsParams().get("offset")).toBe("50");
    expect(router?.location.search).toBe("?page=1");
    expect(getTable()).not.toHaveTextContent("Sync");

    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    const previousPage = screen.getByRole("button", { name: "Previous page" });
    expect(previousPage).toBeEnabled();
    await userEvent.click(previousPage);

    await expectPage("1 - 50", "Sync");
    expect(getLastRunsParams().get("offset")).toBe("0");
    expect(router?.location.search).toBe("");
  });
});

describe("TaskRunsPage filters and the entity picker", () => {
  const SAMPLE_DATABASE = {
    entity_type: "database",
    entity_id: 1,
    entity_name: "Sample Database",
  } as const;
  const ENTITIES_DELAY = 300;

  const setupFilters = () => {
    fetchMock.get("path:/api/task/runs", createMockTaskRunsResponse());
    // only sync runs in the previous 30 days have an entity to pick
    fetchMock.get(
      "path:/api/task/runs/entities",
      ({ url }) => {
        const params = new URL(url).searchParams;
        return params.get("run-type") === "sync" &&
          params.get("started-at") === "past30days"
          ? [SAMPLE_DATABASE]
          : [];
      },
      { delay: ENTITIES_DELAY },
    );
    mockGetBoundingClientRect({ width: 100, height: 100 });

    return renderWithProviders(
      <Route path={PATHNAME} element={<TaskRunsPage />} />,
      { initialRoute: PATHNAME, withRouter: true },
    );
  };

  const getEntityPicker = () => screen.getByPlaceholderText("Filter by entity");
  const getClearButton = (element: HTMLElement) => {
    // eslint-disable-next-line testing-library/no-node-access -- every picker has a "Clear" button; scope to this picker's wrapper
    const wrapper = element.parentElement;
    if (!wrapper) {
      throw new Error("The picker has no wrapper");
    }
    return within(wrapper).getByLabelText("Clear");
  };
  const getEntityLoader = () => {
    // the Mantine loader has no role or label to query by
    /* eslint-disable testing-library/no-node-access */
    const root = getEntityPicker().closest(".mb-mantine-Select-root");
    return root?.querySelector(".mb-mantine-Loader-root");
    /* eslint-enable testing-library/no-node-access */
  };
  const expectEntityTooltip = async (text: string) => {
    fireEvent.mouseEnter(getEntityPicker());
    expect(await screen.findByRole("tooltip")).toHaveTextContent(text);
    fireEvent.mouseLeave(getEntityPicker());
    await waitFor(() =>
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument(),
    );
  };
  const pickOption = async (input: HTMLElement, option: string) => {
    await userEvent.click(input);
    await userEvent.click(await screen.findByRole("option", { name: option }));
  };
  const pickRunType = (runType: string) =>
    pickOption(screen.getByPlaceholderText("Filter by run type"), runType);
  const pickStartedAt = async (label: string) => {
    await openDatePicker();
    await selectRange(label);
    // close the date picker popover
    await openDatePicker();
  };
  const getEntityCalls = () =>
    fetchMock.callHistory.calls("path:/api/task/runs/entities");

  it("filters by run type, start time, entity and status, and resets the entity", async () => {
    const { router } = setupFilters();
    await screen.findByText("No results");

    // disabled without a run type
    expect(getEntityPicker()).toBeDisabled();
    await expectEntityTooltip("Select a run type first");

    await pickRunType("Sync");
    await waitFor(() =>
      expect(router?.location.search).toContain("run-type=sync"),
    );
    await waitFor(() =>
      expect(getLastRunsParams().get("run-type")).toBe("sync"),
    );

    // still disabled without a start time
    expect(getEntityPicker()).toBeDisabled();
    await expectEntityTooltip("Select a start time first");
    expect(getEntityCalls()).toHaveLength(0);

    await pickStartedAt("Previous 30 days");

    // loading entities: disabled with a loader
    await waitFor(() => expect(getEntityCalls()).toHaveLength(1));
    const entityParams = new URL(getEntityCalls()[0].url).searchParams;
    expect(entityParams.get("run-type")).toBe("sync");
    expect(entityParams.get("started-at")).toBe("past30days");
    expect(getEntityPicker()).toBeDisabled();
    expect(getEntityLoader()).toBeInTheDocument();
    await waitFor(() =>
      expect(router?.location.search).toContain("started-at=past30days"),
    );
    expect(getLastRunsParams().get("started-at")).toBe("past30days");

    // enabled once the entities are loaded
    await waitFor(() => expect(getEntityPicker()).toBeEnabled());
    await pickOption(getEntityPicker(), "Sample Database");
    expect(getEntityPicker()).toHaveValue("Sample Database");
    await waitFor(() =>
      expect(router?.location.search).toContain("entity-type=database"),
    );
    expect(router?.location.search).toContain("entity-id=1");
    await waitFor(() =>
      expect(getLastRunsParams().get("entity-type")).toBe("database"),
    );
    expect(getLastRunsParams().get("entity-id")).toBe("1");

    await pickOption(
      screen.getByPlaceholderText("Filter by status"),
      "Success",
    );
    await waitFor(() =>
      expect(router?.location.search).toContain("status=success"),
    );
    expect(getLastRunsParams().get("status")).toBe("success");
    expect(getLastRunsParams().get("entity-id")).toBe("1");

    // clearing the run type clears and disables the entity
    await userEvent.click(
      getClearButton(screen.getByPlaceholderText("Filter by run type")),
    );
    expect(getEntityPicker()).toBeDisabled();
    expect(getEntityPicker()).toHaveValue("");
    await waitFor(() =>
      expect(router?.location.search).not.toContain("run-type"),
    );
    expect(router?.location.search).not.toContain("entity-id");
    expect(getLastRunsParams().get("entity-id")).toBeNull();

    // clearing the start time clears and disables the entity
    await pickRunType("Sync");
    await waitFor(() => expect(getEntityPicker()).toBeEnabled());
    await pickOption(getEntityPicker(), "Sample Database");
    expect(getEntityPicker()).toHaveValue("Sample Database");
    await userEvent.click(
      getClearButton(screen.getByTestId("task-run-date-picker")),
    );
    expect(getEntityPicker()).toBeDisabled();
    expect(getEntityPicker()).toHaveValue("");
    await waitFor(() =>
      expect(getLastRunsParams().get("entity-id")).toBeNull(),
    );

    // no entities for the picked run type and start time
    await pickRunType("Alert");
    await pickStartedAt("Previous 30 days");
    await waitFor(() =>
      expect(getEntityCalls().at(-1)?.url).toContain("run-type=alert"),
    );
    // the previous entities stay listed until the new (empty) list arrives
    await waitFor(() => expect(getEntityPicker()).toBeDisabled());
    await expectEntityTooltip("No entities available");

    await userEvent.click(
      getClearButton(screen.getByPlaceholderText("Filter by run type")),
    );
    await userEvent.click(
      getClearButton(screen.getByTestId("task-run-date-picker")),
    );
    await userEvent.click(
      getClearButton(screen.getByPlaceholderText("Filter by status")),
    );
    await waitFor(() => expect(router?.location.search).toBe(""));
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
