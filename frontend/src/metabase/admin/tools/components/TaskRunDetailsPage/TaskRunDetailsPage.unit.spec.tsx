import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { setupTaskRunEndpoint } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import * as Urls from "metabase/lib/urls";
import type { TaskRunExtended } from "metabase-types/api";
import { createMockTaskRunExtended } from "metabase-types/api/mocks";

import { TaskRunDetailsPage } from "./TaskRunDetailsPage";

const PATHNAME = `${Urls.adminToolsTasksRuns()}/:runId`;

interface SetupOpts {
  taskRun?: TaskRunExtended;
}

const setup = ({ taskRun = createMockTaskRunExtended() }: SetupOpts = {}) => {
  setupTaskRunEndpoint(taskRun);

  return renderWithProviders(
    <Route path={PATHNAME} component={TaskRunDetailsPage} />,
    {
      initialRoute: Urls.adminToolsTaskRunDetails(taskRun.id),
      withRouter: true,
    },
  );
};

describe("TaskRunDetailsPage", () => {
  it("should display formatted datetime for started_at and ended_at", async () => {
    const taskRun = createMockTaskRunExtended({
      started_at: "2023-03-04T01:45:26.005475-08:00",
      ended_at: "2023-03-04T01:46:26.518597-08:00",
    });

    setup({ taskRun });

    await waitForLoaderToBeRemoved();

    // DateTime component should render humanized timestamps (e.g. "March 4, 2023, 1:45 AM")
    expect(screen.getAllByText(/March 4, 2023/).length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("should show raw ISO timestamp in tooltip on hover", async () => {
    const rawTimestamp = "2023-03-04T01:45:26.005475-08:00";
    const taskRun = createMockTaskRunExtended({
      started_at: rawTimestamp,
      ended_at: "2023-03-04T01:46:26.518597-08:00",
    });

    setup({ taskRun });

    await waitForLoaderToBeRemoved();

    const dateTimeElements = screen.getAllByText(/March 4, 2023/);
    await userEvent.hover(dateTimeElements[0]);

    expect(await screen.findByRole("tooltip")).toHaveTextContent(rawTimestamp);
  });
});
