import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupTasksInfoEndpoint } from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  within,
} from "__support__/ui";
import { MonitorContent } from "metabase/monitor/components/MonitorLayout/MonitorContent";
import { Route, withRouteProps } from "metabase/router";
import * as Urls from "metabase/urls";
import type { TaskInfo } from "metabase-types/api";
import {
  createMockJob,
  createMockTaskInfo,
  createMockTrigger,
  createMockUser,
} from "metabase-types/api/mocks";

import { JobInfoApp } from "./JobInfoApp";

const RoutedJobInfoApp = withRouteProps(JobInfoApp);

const PATHNAME = Urls.monitorJobs();

interface SetupOpts {
  error?: boolean;
  taskInfo?: TaskInfo;
  initialRoute?: string;
}

const setup = ({
  error,
  taskInfo = createMockTaskInfo(),
  initialRoute = PATHNAME,
}: SetupOpts = {}) => {
  if (error) {
    fetchMock.get("path:/api/task/info", { status: 500 });
  } else {
    setupTasksInfoEndpoint(taskInfo);
  }

  mockGetBoundingClientRect({ width: 100, height: 100 });

  return renderWithProviders(
    <Route
      path={PATHNAME}
      element={
        <MonitorContent>
          <RoutedJobInfoApp />
        </MonitorContent>
      }
    >
      <Route path=":jobKey" />
    </Route>,
    {
      initialRoute,
      withRouter: true,
      storeInitialState: {
        currentUser: createMockUser(),
      },
    },
  );
};

describe("JobInfoApp", () => {
  it("should show the scheduler info and the jobs table", async () => {
    setup({
      taskInfo: createMockTaskInfo({
        scheduler: ["Scheduler line 1", "Scheduler line 2"],
        jobs: [createMockJob({ key: "a-job-key" })],
      }),
    });

    expect(await screen.findByText(/Scheduler line 1/)).toBeInTheDocument();
    expect(screen.getByText(/Scheduler line 2/)).toBeInTheDocument();
    expect(screen.getByRole("treegrid", { name: "Jobs" })).toBeInTheDocument();
    expect(screen.getByText("a-job-key")).toBeInTheDocument();
    expect(screen.getByText("org.quartz.jobs.AJobClass")).toBeInTheDocument();
    expect(screen.getByText("A job description")).toBeInTheDocument();
  });

  it("should show an empty state when there are no jobs", async () => {
    setup({ taskInfo: createMockTaskInfo({ jobs: [] }) });

    expect(await screen.findByText("No results")).toBeInTheDocument();
  });

  it("should show an error state", async () => {
    setup({ error: true });

    expect(await screen.findByText("An error occurred")).toBeInTheDocument();
    expect(screen.queryByText("No results")).not.toBeInTheDocument();
  });

  it("should open the triggers sidebar in the Monitor outlet when a row is clicked", async () => {
    const { history } = setup({
      taskInfo: createMockTaskInfo({
        jobs: [
          createMockJob({
            key: "a-job-key",
            triggers: [
              createMockTrigger({ key: "trigger-1", state: "WAITING" }),
              createMockTrigger({ key: "trigger-2", state: "PAUSED" }),
            ],
          }),
        ],
      }),
    });

    const row = await screen.findByTestId("job");
    await userEvent.click(row);

    expect(history?.getCurrentLocation().pathname).toBe(
      Urls.monitorJobTriggers("a-job-key"),
    );

    const sidebar = await screen.findByTestId("job-triggers-sidebar");
    expect(screen.getByTestId("monitor-sidebar-region")).toContainElement(
      sidebar,
    );
    expect(
      within(sidebar).getByText("Triggers for a-job-key"),
    ).toBeInTheDocument();
    expect(within(sidebar).getByText("trigger-1")).toBeInTheDocument();
    expect(within(sidebar).getByText("WAITING")).toBeInTheDocument();
    expect(within(sidebar).getByText("trigger-2")).toBeInTheDocument();
    expect(within(sidebar).getByText("PAUSED")).toBeInTheDocument();
  });

  it("should open the triggers sidebar via keyboard row activation", async () => {
    const { history } = setup({
      taskInfo: createMockTaskInfo({
        jobs: [
          createMockJob({
            key: "a-job-key",
            triggers: [createMockTrigger({ key: "trigger-1" })],
          }),
        ],
      }),
    });

    const table = await screen.findByRole("treegrid", { name: "Jobs" });
    table.focus();
    // ArrowDown activates the first row, Enter opens its triggers
    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(history?.getCurrentLocation().pathname).toBe(
      Urls.monitorJobTriggers("a-job-key"),
    );

    const sidebar = await screen.findByTestId("job-triggers-sidebar");
    expect(within(sidebar).getByText("trigger-1")).toBeInTheDocument();
  });

  it("should render every trigger attribute, null placeholders, and the may-fire-again No branch", async () => {
    setup({
      taskInfo: createMockTaskInfo({
        jobs: [
          createMockJob({
            key: "a-job-key",
            triggers: [
              createMockTrigger({
                key: "trigger-1",
                "end-time": null,
                "final-fire-time": null,
                "may-fire-again?": false,
              }),
            ],
          }),
        ],
      }),
      initialRoute: Urls.monitorJobTriggers("a-job-key"),
    });

    const sidebar = await screen.findByTestId("job-triggers-sidebar");

    // all 11 labelled attribute rows are present
    [
      "Key",
      "Description",
      "State",
      "Priority",
      "Last Fired",
      "Next Fire Time",
      "Start Time",
      "End Time",
      "Final Fire Time",
      "May Fire Again?",
      "Misfire Instruction",
    ].forEach((label) => {
      expect(within(sidebar).getByText(label)).toBeInTheDocument();
    });

    // may-fire-again? false renders as "No"
    expect(within(sidebar).getByText("No")).toBeInTheDocument();
    // null End Time / Final Fire Time render the empty-cell placeholder
    expect(within(sidebar).getAllByText("—")).toHaveLength(2);
  });

  it("should show a no-triggers message when the job has no triggers", async () => {
    setup({
      taskInfo: createMockTaskInfo({
        jobs: [createMockJob({ key: "a-job-key", triggers: [] })],
      }),
      initialRoute: Urls.monitorJobTriggers("a-job-key"),
    });

    const sidebar = await screen.findByTestId("job-triggers-sidebar");
    expect(within(sidebar).getByText("No triggers")).toBeInTheDocument();
  });

  it("should close the triggers sidebar", async () => {
    const { history } = setup({
      taskInfo: createMockTaskInfo({
        jobs: [
          createMockJob({
            key: "a-job-key",
            triggers: [createMockTrigger()],
          }),
        ],
      }),
      initialRoute: Urls.monitorJobTriggers("a-job-key"),
    });

    const sidebar = await screen.findByTestId("job-triggers-sidebar");
    await userEvent.click(
      within(sidebar).getByRole("button", { name: "Close" }),
    );

    expect(history?.getCurrentLocation().pathname).toBe(Urls.monitorJobs());
    expect(
      screen.queryByTestId("job-triggers-sidebar"),
    ).not.toBeInTheDocument();
  });

  it("should show the triggers sidebar when opened via a direct link", async () => {
    setup({
      taskInfo: createMockTaskInfo({
        jobs: [
          createMockJob({
            key: "a-job-key",
            triggers: [createMockTrigger({ key: "trigger-1" })],
          }),
        ],
      }),
      initialRoute: Urls.monitorJobTriggers("a-job-key"),
    });

    const sidebar = await screen.findByTestId("job-triggers-sidebar");
    expect(within(sidebar).getByText("trigger-1")).toBeInTheDocument();
  });
});
