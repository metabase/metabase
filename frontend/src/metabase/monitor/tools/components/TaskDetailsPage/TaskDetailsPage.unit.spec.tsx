import { useClipboard } from "@mantine/hooks";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { readBlobText, setupDownloadCapture } from "__support__/downloads";
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
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import type { Task } from "metabase-types/api";
import { createMockTask } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { TaskDetailsPage } from "./TaskDetailsPage";

jest.mock("@mantine/hooks", () => ({
  ...jest.requireActual("@mantine/hooks"),
  useClipboard: jest.fn(),
}));

// Unjustified type cast. FIXME
const mockUseClipboard = useClipboard as jest.Mock;

const PATHNAME = `${Urls.monitorTasksList()}/:taskId`;

interface SetupOpts {
  task?: Task;
}

const setup = ({ task = createMockTask() }: SetupOpts = {}) => {
  setupDatabasesEndpoints([createSampleDatabase()]);
  setupTaskEndpoint(task);

  return renderWithProviders(
    <>
      <Route path={PATHNAME} element={<TaskDetailsPage />} />
      <Route
        path={Urls.monitorTasksList()}
        element={<div data-testid="task-list-page" />}
      />
    </>,
    {
      initialRoute: Urls.monitorTaskDetails(task.id),
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

    const copyButtons = screen.getAllByRole("button", { name: "Copy" });

    await userEvent.click(copyButtons[0]);
    expect(copyMock).toHaveBeenCalledWith(startedAt);

    await userEvent.click(copyButtons[1]);
    expect(copyMock).toHaveBeenCalledWith(endedAt);
  });

  it("shows a placeholder when the task has no captured logs", async () => {
    setup({ task: createMockTask({ logs: null }) });

    await waitForLoaderToBeRemoved();

    expect(screen.getByText("There are no captured logs")).toBeInTheDocument();
    expect(screen.queryByTestId("task-logs")).not.toBeInTheDocument();
  });

  it("should show a link back to the tasks list", async () => {
    const { router } = setup();

    await waitForLoaderToBeRemoved();

    const backLink = screen.getByRole("link", { name: /Back to Tasks/ });
    expect(backLink).toHaveAttribute("href", Urls.monitorTasksList());

    // the page is the first history entry, so the link must not rely on history (metabase#57113)
    await userEvent.click(backLink);
    expect(router?.location.pathname).toBe(Urls.monitorTasksList());
    expect(await screen.findByTestId("task-list-page")).toBeInTheDocument();
  });

  describe("JSON details and logs", () => {
    const taskDetails = { useful: { information: true } };
    const formattedJson = JSON.stringify(taskDetails, null, 2);
    const otherTask = createMockTask({ id: 6, task: "Other task" });

    const setupDetails = (task: Task) => {
      // only the requested task responds; any other id would hit an unmocked route
      setupTaskEndpoint(otherTask);
      return setup({ task });
    };

    const originalClipboard = Object.getOwnPropertyDescriptor(
      navigator,
      "clipboard",
    );

    let downloadCapture: ReturnType<typeof setupDownloadCapture>;

    beforeEach(() => {
      downloadCapture = setupDownloadCapture();
    });

    afterEach(() => {
      downloadCapture.restore();
      if (originalClipboard) {
        Object.defineProperty(navigator, "clipboard", originalClipboard);
      } else {
        // the property was added by the test; drop it again
        Reflect.deleteProperty(navigator, "clipboard");
      }
    });

    it("shows the task JSON, copies and downloads it, with no captured logs", async () => {
      const writeText = jest.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true,
      });
      mockUseClipboard.mockImplementation(
        jest.requireActual("@mantine/hooks").useClipboard,
      );
      const task = createMockTask({
        id: 7,
        task_details: taskDetails,
        logs: [],
      });
      setupDetails(task);

      await waitForLoaderToBeRemoved();
      expect(
        fetchMock.callHistory.calls(`path:/api/task/${task.id}`),
      ).toHaveLength(1);

      const codeContainer = screen.getByTestId("code-container");
      // CodeMirror is mocked with a textarea in Jest; the value is what it would show line by line
      const editor = await within(codeContainer).findByRole("textbox");
      expect(editor).toHaveValue(
        ["{", '  "useful": {', '    "information": true', "  }", "}"].join(
          "\n",
        ),
      );

      expect(screen.getByText("There are no captured logs")).toBeVisible();
      expect(screen.queryByTestId("task-logs")).not.toBeInTheDocument();

      await userEvent.click(
        within(codeContainer).getByRole("button", { name: "Copy" }),
      );
      expect(writeText).toHaveBeenCalledWith(formattedJson);
      expect(await screen.findByRole("tooltip")).toHaveTextContent("Copied!");

      await userEvent.click(screen.getByRole("button", { name: /Download/ }));
      expect(downloadCapture.downloads).toHaveLength(1);
      const [download] = downloadCapture.downloads;
      expect(download.fileName).toBe("task-7.json");
      expect(download.href).toMatch(/^blob:/);
      expect(await readBlobText(download.blob)).toBe(formattedJson);
    });

    it("shows the captured logs instead of the placeholder", async () => {
      const task = createMockTask({
        id: 7,
        task_details: taskDetails,
        logs: [
          {
            timestamp: "2024-01-10T10:00:00.000Z",
            process_uuid: "test-uuid-1234",
            fqns: "metabase.sync.sync",
            msg: "Starting database sync",
            level: "INFO",
            exception: null,
          },
          {
            timestamp: "2024-01-10T10:00:01.000Z",
            process_uuid: "test-uuid-1234",
            fqns: "metabase.sync.sync",
            msg: "Sync completed successfully",
            level: "DEBUG",
            exception: null,
          },
        ],
      });
      setupDetails(task);

      await waitForLoaderToBeRemoved();

      const logs = screen.getByTestId("task-logs");
      expect(within(logs).getByText(/Starting database sync/)).toBeVisible();
      expect(
        within(logs).getByText(/Sync completed successfully/),
      ).toBeVisible();
      expect(
        screen.queryByText("There are no captured logs"),
      ).not.toBeInTheDocument();
    });
  });
});
