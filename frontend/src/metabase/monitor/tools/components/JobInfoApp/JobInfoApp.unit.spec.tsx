import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { setupTasksInfoEndpoint } from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
} from "__support__/ui";
import * as Urls from "metabase/urls";
import type { TaskInfo } from "metabase-types/api";
import { createMockJob, createMockTaskInfo } from "metabase-types/api/mocks";

import { JobInfoApp } from "./JobInfoApp";

const PATHNAME = Urls.monitorJobs();

interface SetupOpts {
  error?: boolean;
  taskInfo?: TaskInfo;
}

const setup = ({ error, taskInfo = createMockTaskInfo() }: SetupOpts = {}) => {
  if (error) {
    fetchMock.get("path:/api/task/info", { status: 500 });
  } else {
    setupTasksInfoEndpoint(taskInfo);
  }

  mockGetBoundingClientRect({ width: 100, height: 100 });

  return renderWithProviders(
    <Route path={PATHNAME} component={JobInfoApp}>
      {/* stub so row-click navigation to a job's triggers modal resolves */}
      <Route path=":jobKey" />
    </Route>,
    {
      initialRoute: PATHNAME,
      withRouter: true,
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

  it("should navigate to the job's triggers when a row is clicked", async () => {
    const { history } = setup({
      taskInfo: createMockTaskInfo({
        jobs: [createMockJob({ key: "a-job-key" })],
      }),
    });

    const row = await screen.findByTestId("job");
    await userEvent.click(row);

    expect(history?.getCurrentLocation().pathname).toBe(
      Urls.monitorJobTriggers("a-job-key"),
    );
  });
});
