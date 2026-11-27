import userEvent from "@testing-library/user-event";
import fetchMock, { type CallLog } from "fetch-mock";

import {
  setupDatabaseListEndpoint,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import {
  setupGetTransformJobEndpoint,
  setupListTransformJobTransformsEndpoint,
  setupListTransformTagsEndpoint,
} from "__support__/server-mocks/transform";
import {
  act,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import type { TransformJob, TransformJobId } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTransformJob,
  createMockTransformTag,
} from "metabase-types/api/mocks";

import { JobListPage } from "../JobListPage";

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

// The built-in jobs and tags seeded by the backend (057_update_migrations.yaml),
// see test/metabase/transforms_rest/api/transform_job_test.clj
const BUILT_IN_JOBS = [
  createMockTransformJob({
    id: 1,
    name: "Hourly job",
    schedule: "0 0 * * * ? *",
    ui_display_type: "cron/builder",
  }),
  createMockTransformJob({
    id: 2,
    name: "Daily job",
    schedule: "0 0 0 * * ? *",
    ui_display_type: "cron/builder",
  }),
  createMockTransformJob({
    id: 3,
    name: "Weekly job",
    schedule: "0 0 0 ? * 1 *",
    ui_display_type: "cron/builder",
  }),
  createMockTransformJob({
    id: 4,
    name: "Monthly job",
    schedule: "0 0 0 1 * ? *",
    ui_display_type: "cron/builder",
  }),
];

const BUILT_IN_TAGS = [
  createMockTransformTag({ id: 1, name: "hourly" }),
  createMockTransformTag({ id: 2, name: "daily" }),
  createMockTransformTag({ id: 3, name: "weekly" }),
  createMockTransformTag({ id: 4, name: "monthly" }),
];

const parseBody = (call: CallLog): unknown =>
  JSON.parse(String(call.options.body ?? "{}"));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getJobId = (call: CallLog) => Number(call.expressParams?.id);

function toJobPatch(body: unknown): Partial<TransformJob> {
  if (!isRecord(body)) {
    return {};
  }
  const patch: Partial<TransformJob> = {};
  if (typeof body.name === "string") {
    patch.name = body.name;
  }
  if (typeof body.schedule === "string") {
    patch.schedule = body.schedule;
  }
  if (body.ui_display_type === "cron/builder") {
    patch.ui_display_type = "cron/builder";
  }
  if (body.ui_display_type === "cron/raw") {
    patch.ui_display_type = "cron/raw";
  }
  if (Array.isArray(body.tag_ids)) {
    patch.tag_ids = body.tag_ids.map(Number);
  }
  return patch;
}

/**
 * An in-memory stand-in for the transform job endpoints. Each handler changes
 * the stored jobs itself, so the UI only shows a change after the request that
 * makes it.
 */
function setupJobsServer(initialJobs: TransformJob[]) {
  let jobs = [...initialJobs];
  const findJob = (id: TransformJobId) => jobs.find((job) => job.id === id);

  fetchMock.get("path:/api/transform-job", () => jobs);
  fetchMock.get("express:/api/transform-job/:id", (call) => {
    const job = findJob(getJobId(call));
    return job ?? 404;
  });
  fetchMock.put("express:/api/transform-job/:id", (call) => {
    const job = findJob(getJobId(call));
    if (job == null) {
      return 404;
    }
    const updatedJob = { ...job, ...toJobPatch(parseBody(call)) };
    jobs = jobs.map((job) => (job.id === updatedJob.id ? updatedJob : job));
    return updatedJob;
  });
  fetchMock.delete("express:/api/transform-job/:id", (call) => {
    const job = findJob(getJobId(call));
    if (job == null) {
      return 404;
    }
    jobs = jobs.filter(({ id }) => id !== job.id);
    return 204;
  });
}

function setupWithJobList({
  jobs,
  jobId,
}: {
  jobs: TransformJob[];
  jobId: TransformJobId;
}) {
  // the job list TreeTable virtualizes rows and needs a measurable size
  mockGetBoundingClientRect({ width: 800, height: 600 });
  setupDatabaseListEndpoint([createMockDatabase()]);
  setupListTransformTagsEndpoint(BUILT_IN_TAGS);
  setupUserMetabotPermissionsEndpoint();
  jobs.forEach((job) => setupListTransformJobTransformsEndpoint(job.id, []));
  setupJobsServer(jobs);

  const { router } = renderWithProviders(
    <>
      <Route path={Urls.transformJobList()} element={<JobListPage />} />
      <Route path="/data-studio/transforms/jobs/:jobId" element={<JobPage />} />
    </>,
    {
      withRouter: true,
      withUndos: true,
      initialRoute: Urls.transformJob(jobId),
    },
  );
  return { router };
}

function getUpdateRequestBodies(jobId: TransformJobId) {
  return fetchMock.callHistory
    .calls(`path:/api/transform-job/${jobId}`, { method: "PUT" })
    .map(parseBody);
}

const getSchedulePicker = () => within(screen.getByTestId("schedule-picker"));

async function findToast(message: string) {
  const toast = await screen.findByTestId("toast-undo");
  expect(within(toast).getByText(message)).toBeInTheDocument();
  await userEvent.click(within(toast).getByLabelText("close icon"));
  await waitFor(() =>
    expect(screen.queryByTestId("toast-undo")).not.toBeInTheDocument(),
  );
}

/**
 * Closes the tag dropdown, so that the only tag names left on the page are the
 * pills of the selected tags.
 */
async function expectSelectedTags(selectedTagNames: string[]) {
  await userEvent.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("option")).not.toBeInTheDocument(),
  );
  for (const { name } of BUILT_IN_TAGS) {
    if (selectedTagNames.includes(name)) {
      expect(await screen.findByText(name)).toBeInTheDocument();
    } else {
      expect(screen.queryByText(name)).not.toBeInTheDocument();
    }
  }
}

describe("JobPage built-in jobs", () => {
  it.each([
    ["Hourly job", "hourly"],
    ["Daily job", "daily"],
    ["Weekly job", "weekly"],
    ["Monthly job", "monthly"],
  ])("shows the frequency of the %s", async (jobName, frequency) => {
    const job = BUILT_IN_JOBS.find(({ name }) => name === jobName);
    if (job == null) {
      throw new Error(`Unknown job ${jobName}`);
    }
    setup({ job });
    await screen.findByTestId("schedule-picker");
    expect(getSchedulePicker().getByLabelText("Frequency")).toHaveValue(
      frequency,
    );
  });
});

describe("JobPage editing", () => {
  const job = createMockTransformJob({
    id: 7,
    name: "New job",
    schedule: "0 0 0 * * ? *",
    ui_display_type: "cron/builder",
    tag_ids: [],
  });

  it("edits the schedule, name, and tags of a job and deletes it", async () => {
    const { router } = setupWithJobList({
      jobs: [...BUILT_IN_JOBS, job],
      jobId: job.id,
    });

    // a job without transforms does not render the transforms table
    expect(
      await screen.findByText("There are no transforms for this job."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Job transforms")).not.toBeInTheDocument();

    // change the schedule
    await userEvent.click(getSchedulePicker().getByLabelText("Frequency"));
    await userEvent.click(
      await screen.findByRole("option", { name: "weekly" }),
    );
    await waitFor(() =>
      expect(getUpdateRequestBodies(job.id)).toEqual([
        { schedule: "0 0 0 ? * 2 *", ui_display_type: "cron/builder" },
      ]),
    );
    await findToast("Job schedule updated");
    expect(getSchedulePicker().getByLabelText("Frequency")).toHaveValue(
      "weekly",
    );

    // change the name
    const nameInput = screen.getByPlaceholderText("Name");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "New name");
    await userEvent.tab();
    await waitFor(() =>
      expect(getUpdateRequestBodies(job.id).slice(1)).toEqual([
        { name: "New name" },
      ]),
    );
    await findToast("Job name updated");
    expect(screen.getByPlaceholderText("Name")).toHaveValue("New name");

    // add and remove tags
    await userEvent.click(screen.getByPlaceholderText("Add tags"));
    await userEvent.click(
      await screen.findByRole("option", { name: /^hourly/ }),
    );
    await waitFor(() =>
      expect(getUpdateRequestBodies(job.id).slice(2)).toEqual([
        { tag_ids: [1] },
      ]),
    );
    await expectSelectedTags(["hourly"]);

    await userEvent.click(screen.getByPlaceholderText("Add tags"));
    await userEvent.click(
      await screen.findByRole("option", { name: /^daily/ }),
    );
    await waitFor(() =>
      expect(getUpdateRequestBodies(job.id).slice(3)).toEqual([
        { tag_ids: [1, 2] },
      ]),
    );
    await expectSelectedTags(["hourly", "daily"]);

    await userEvent.type(
      screen.getByPlaceholderText("Add tags"),
      "{backspace}",
    );
    await waitFor(() =>
      expect(getUpdateRequestBodies(job.id).slice(4)).toEqual([
        { tag_ids: [1] },
      ]),
    );
    await expectSelectedTags(["hourly"]);

    // delete the job
    const header = screen.getByTestId("jobs-header");
    await userEvent.click(within(header).getByLabelText("Job options"));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Delete/ }),
    );
    const modal = await screen.findByRole("dialog");
    await userEvent.click(
      within(modal).getByRole("button", { name: "Delete job" }),
    );

    await waitFor(() =>
      expect(router?.location.pathname).toBe(Urls.transformJobList()),
    );
    expect(
      fetchMock.callHistory
        .calls("express:/api/transform-job/:id", { method: "DELETE" })
        .map(getJobId),
    ).toEqual([job.id]);
    const list = await screen.findByTestId("transforms-job-list");
    expect(await within(list).findByText("Hourly job")).toBeInTheDocument();
    expect(within(list).queryByText("New name")).not.toBeInTheDocument();
  });
});
