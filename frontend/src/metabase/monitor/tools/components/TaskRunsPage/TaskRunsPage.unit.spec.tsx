import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { setupTaskRunsEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import * as Urls from "metabase/urls";
import type { ListTaskRunsResponse } from "metabase-types/api";
import { createMockTaskRun } from "metabase-types/api/mocks";

import { TaskRunsPage } from "./TaskRunsPage";

const PATHNAME = Urls.adminToolsTasksRuns();

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

  return renderWithProviders(
    <Route path={PATHNAME} component={TaskRunsPage} />,
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

    await waitForLoaderToBeRemoved();

    const startedAtElement = screen.getByTestId("started-at");
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

    await waitForLoaderToBeRemoved();

    const startedAtElement = screen.getByTestId("started-at");
    await userEvent.hover(startedAtElement);

    expect(await screen.findByRole("tooltip")).toHaveTextContent(rawTimestamp);
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
