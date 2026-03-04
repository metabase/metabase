import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { setupTaskRunsEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import * as Urls from "metabase/lib/urls";
import type { ListTaskRunsResponse } from "metabase-types/api";
import { createMockTaskRun } from "metabase-types/api/mocks";

import { TaskRunsPage } from "./TaskRunsPage";

const PATHNAME = Urls.adminToolsTasksRuns();

interface SetupOpts {
  taskRunsResponse?: ListTaskRunsResponse;
  error?: boolean;
}

const setup = ({
  taskRunsResponse = createMockTaskRunsResponse(),
  error,
}: SetupOpts = {}) => {
  if (error) {
    fetchMock.get("path:/api/task/runs", { status: 500 });
  } else {
    setupTaskRunsEndpoints(taskRunsResponse);
  }

  return renderWithProviders(
    <Route path={PATHNAME} component={TaskRunsPage} />,
    {
      initialRoute: PATHNAME,
      withRouter: true,
    },
  );
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
