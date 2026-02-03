import * as mantineHooks from "@mantine/hooks";
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
  within,
} from "__support__/ui";
import * as Urls from "metabase/lib/urls";
import type { Task } from "metabase-types/api";
import { createMockTask } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { TaskDetailsPage } from "./TaskDetailsPage";

const mockUseClipboard = jest.fn();
jest.spyOn(mantineHooks, "useClipboard").mockImplementation(mockUseClipboard);

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
  beforeEach(() => {
    mockUseClipboard.mockReturnValue({
      copy: jest.fn(),
      copied: false,
      reset: jest.fn(),
      error: null,
    });
  });

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

    const startedAtElement = screen.getByTestId("started-at");
    const endedAtElement = screen.getByTestId("ended-at");
    expect(startedAtElement).toHaveTextContent("March 4, 2023, 1:45 AM");
    expect(endedAtElement).toHaveTextContent("March 4, 2023, 1:46 AM");
  });

  it("should show raw ISO timestamp in tooltip on hover", async () => {
    const rawTimestamp = "2023-03-04T01:45:26.005475-08:00";
    const task = createMockTask({
      started_at: rawTimestamp,
      ended_at: "2023-03-04T01:46:26.518597-08:00",
    });

    setup({ task });

    await waitForLoaderToBeRemoved();

    const startedAtElement = screen.getByTestId("started-at");
    await userEvent.hover(startedAtElement);

    expect(await screen.findByRole("tooltip")).toHaveTextContent(rawTimestamp);
  });

  it("should copy raw ISO timestamp to clipboard when clicking copy button", async () => {
    const copyMock = jest.fn();
    mockUseClipboard.mockReturnValue({
      copy: copyMock,
      copied: false,
      reset: jest.fn(),
      error: null,
    });

    const startedAt = "2023-03-04T01:45:26.005475-08:00";
    const endedAt = "2023-03-04T01:46:26.518597-08:00";
    const task = createMockTask({
      started_at: startedAt,
      ended_at: endedAt,
    });

    setup({ task });

    await waitForLoaderToBeRemoved();

    const copyButtons = screen.getAllByTestId("copy-button");

    const startedAtCopyIcon = within(copyButtons[0]).getByRole("img", {
      name: "copy icon",
    });
    await userEvent.click(startedAtCopyIcon);
    expect(copyMock).toHaveBeenCalledWith(startedAt);

    const endedAtCopyIcon = within(copyButtons[1]).getByRole("img", {
      name: "copy icon",
    });
    await userEvent.click(endedAtCopyIcon);
    expect(copyMock).toHaveBeenCalledWith(endedAt);
  });
});
