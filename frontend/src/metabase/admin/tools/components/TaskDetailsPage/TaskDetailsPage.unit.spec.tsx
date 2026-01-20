import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import {
  setupDatabasesEndpoints,
  setupTaskEndpoint,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import * as Urls from "metabase/lib/urls";
import type { Task } from "metabase-types/api";
import { createMockTask } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { TaskDetailsPage } from "./TaskDetailsPage";

const PATHNAME = `${Urls.adminToolsTasksList()}/:taskId`;

interface SetupOpts {
  task?: Task;
}

const setup = ({ task = createMockTask() }: SetupOpts = {}) => {
  setupDatabasesEndpoints([createSampleDatabase()]);
  setupTaskEndpoint(task);

  return renderWithProviders(
    <Route path={PATHNAME} component={TaskDetailsPage} />,
    {
      initialRoute: Urls.adminToolsTaskDetails(task.id),
      withRouter: true,
    },
  );
};

describe("TaskDetailsPage", () => {
  it("should display task details", async () => {
    const task = createMockTask({
      id: 42,
      task: "sync-database",
      status: "success",
    });

    setup({ task });

    await waitForLoaderToBeRemoved();

    expect(screen.getByText("Task details")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("sync-database")).toBeInTheDocument();
  });

  it("should display formatted datetime for started_at and ended_at", async () => {
    const task = createMockTask({
      started_at: "2023-03-04T01:45:26.005475-08:00",
      ended_at: "2023-03-04T01:46:26.518597-08:00",
    });

    setup({ task });

    await waitForLoaderToBeRemoved();

    expect(screen.getAllByText(/March 4, 2023/).length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("should show raw ISO timestamp in tooltip on hover", async () => {
    const rawTimestamp = "2023-03-04T01:45:26.005475-08:00";
    const task = createMockTask({
      started_at: rawTimestamp,
      ended_at: "2023-03-04T01:46:26.518597-08:00",
    });

    setup({ task });

    await waitForLoaderToBeRemoved();

    const dateTimeElements = screen.getAllByText(/March 4, 2023/);
    await userEvent.hover(dateTimeElements[0]);

    expect(await screen.findByRole("tooltip")).toHaveTextContent(rawTimestamp);
  });
});
