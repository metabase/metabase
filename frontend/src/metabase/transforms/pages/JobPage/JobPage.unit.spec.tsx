import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDatabaseListEndpoint,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import {
  setupCancelJobRunEndpoint,
  setupGetTransformJobEndpoint,
  setupListJobRunTransformRunsEndpoint,
  setupListTransformJobTransformsEndpoint,
  setupListTransformTagsEndpoint,
  setupRunTransformJobEndpoint,
} from "__support__/server-mocks/transform";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import { defer } from "metabase/utils/promise";
import type { RunTransformJobResponse, TransformJob } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTransform,
  createMockTransformJob,
  createMockTransformRun,
} from "metabase-types/api/mocks";

import { JobPage } from "./JobPage";

const TRANSFORMS_DELAY = 1000;

type SetupOpts = {
  job?: TransformJob;
  transformsDelay?: number;
};

const setup = ({
  job = createMockTransformJob({ id: 1, name: "My Job" }),
  transformsDelay = 0,
}: SetupOpts = {}) => {
  setupGetTransformJobEndpoint(job);
  setupDatabaseListEndpoint([createMockDatabase()]);
  setupListTransformTagsEndpoint([]);
  setupUserMetabotPermissionsEndpoint();
  setupListTransformJobTransformsEndpoint(job.id, [], {
    delay: transformsDelay,
  });

  const path = Urls.transformJob(job.id);
  renderWithProviders(
    <Route path="/data-studio/transforms/jobs/:jobId" element={<JobPage />} />,
    { withRouter: true, initialRoute: path },
  );
};

describe("JobPage", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders the job details before the transform plan resolves", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    setup({ transformsDelay: TRANSFORMS_DELAY });

    // The job header and its details render without waiting for the slow
    // transforms endpoint.
    const header = await screen.findByTestId("jobs-header");
    expect(within(header).getByDisplayValue("My Job")).toBeInTheDocument();
    expect(screen.getByText("Transforms")).toBeInTheDocument();

    // The transforms list hasn't loaded yet, and editing stays locked while
    // permissions are still being checked.
    expect(
      screen.queryByText("There are no transforms for this job."),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("run-button")).toBeDisabled();

    act(() => {
      jest.advanceTimersByTime(TRANSFORMS_DELAY);
    });

    // Once the plan resolves, the transforms list renders and editing unlocks.
    expect(
      await screen.findByText("There are no transforms for this job."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("run-button")).toBeEnabled();
  });
});

describe("JobPage manual run", () => {
  const JOB_RUN_ID = 7;
  const settleOnCleanup: (() => void)[] = [];

  afterEach(() => {
    settleOnCleanup.splice(0).forEach((settle) => settle());
  });

  it("offers to cancel a job run only once the job shows the run that the server accepted", async () => {
    const job = createMockTransformJob({ id: 1, name: "My Job" });
    const runResponse = defer<RunTransformJobResponse>();
    const jobRefetch = defer<TransformJob>();
    settleOnCleanup.push(
      () => runResponse.resolve({ job_run_id: JOB_RUN_ID }),
      () => jobRefetch.resolve(job),
    );
    let jobRequestCount = 0;

    setupGetTransformJobEndpoint(job, () => {
      jobRequestCount += 1;
      return jobRequestCount === 1 ? job : jobRefetch.promise;
    });
    setupDatabaseListEndpoint([
      createMockDatabase({ id: 1, transforms_permissions: "write" }),
    ]);
    setupListTransformTagsEndpoint([]);
    setupUserMetabotPermissionsEndpoint();
    setupListTransformJobTransformsEndpoint(job.id, [createMockTransform()]);
    setupRunTransformJobEndpoint(job.id, () => runResponse.promise);
    setupListJobRunTransformRunsEndpoint(job.id, JOB_RUN_ID, []);
    setupCancelJobRunEndpoint(job.id, JOB_RUN_ID);

    renderWithProviders(
      <Route
        path="/data-studio/transforms/jobs/:jobId"
        element={<JobPage />}
      />,
      { withRouter: true, initialRoute: Urls.transformJob(job.id) },
    );

    const runButton = await screen.findByRole("button", { name: "Run now" });
    await waitFor(() => expect(runButton).toBeEnabled());
    await userEvent.click(runButton);

    expect(
      await screen.findByRole("button", { name: "Running now…" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("cancel-button")).not.toBeInTheDocument();

    runResponse.resolve({ message: "Job run started", job_run_id: JOB_RUN_ID });
    await waitFor(() => expect(jobRequestCount).toBe(2));
    expect(screen.queryByTestId("cancel-button")).not.toBeInTheDocument();

    jobRefetch.resolve({
      ...job,
      last_run: createMockTransformRun({
        id: JOB_RUN_ID,
        status: "started",
        end_time: null,
      }),
    });
    await userEvent.click(await screen.findByTestId("cancel-button"));
    await userEvent.click(
      await screen.findByRole("button", { name: "Cancel run" }),
    );

    await waitFor(() =>
      expect(
        fetchMock.callHistory.called(
          `path:/api/transform-job/${job.id}/runs/${JOB_RUN_ID}/cancel`,
        ),
      ).toBe(true),
    );
  });
});
