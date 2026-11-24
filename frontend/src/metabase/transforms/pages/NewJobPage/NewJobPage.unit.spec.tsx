import userEvent from "@testing-library/user-event";
import fetchMock, { type CallLog } from "fetch-mock";

import {
  setupDatabaseListEndpoint,
  setupListTransformJobTransformsEndpoint,
  setupListTransformTagsEndpoint,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import * as Analytics from "metabase/analytics";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import type { TransformJob } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTransformJob,
  createMockTransformTag,
} from "metabase-types/api/mocks";

import { JobPage } from "../JobPage";

import { NewJobPage } from "./NewJobPage";

const NEW_JOB_ID = 5;

// The built-in tags the backend seeds, see
// test/metabase/transforms_rest/api/transform_job_test.clj
const DEFAULT_TAGS = [
  createMockTransformTag({ id: 1, name: "hourly" }),
  createMockTransformTag({ id: 2, name: "daily" }),
  createMockTransformTag({ id: 3, name: "weekly" }),
  createMockTransformTag({ id: 4, name: "monthly" }),
];

const parseBody = (call: CallLog): unknown =>
  JSON.parse(String(call.options.body ?? "{}"));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * Stands in for POST /api/transform-job and GET /api/transform-job/:id: the
 * job only exists after the POST that creates it, and it is stored with the
 * fields from the request body.
 */
function setupJobsServer() {
  let createdJob: TransformJob | undefined;

  fetchMock.post("path:/api/transform-job", (call) => {
    const body = parseBody(call);
    if (!isRecord(body) || createdJob != null) {
      return 400;
    }
    createdJob = createMockTransformJob({
      id: NEW_JOB_ID,
      name: String(body.name),
      schedule: String(body.schedule),
      ui_display_type:
        body.ui_display_type === "cron/raw" ? "cron/raw" : "cron/builder",
      tag_ids: Array.isArray(body.tag_ids) ? body.tag_ids.map(Number) : [],
      active: true,
    });
    return createdJob;
  });
  fetchMock.get(`path:/api/transform-job/${NEW_JOB_ID}`, () =>
    createdJob != null ? createdJob : 404,
  );
}

function setup() {
  setupUserMetabotPermissionsEndpoint();
  setupDatabaseListEndpoint([createMockDatabase()]);
  setupListTransformTagsEndpoint(DEFAULT_TAGS);
  setupListTransformJobTransformsEndpoint(NEW_JOB_ID, []);
  setupJobsServer();
  // metabase/analytics is mocked for every test in frontend/test/__support__/mocks.js
  const trackSimpleEvent = jest.mocked(Analytics.trackSimpleEvent);
  trackSimpleEvent.mockClear();

  const { router } = renderWithProviders(
    <>
      <Route path={Urls.newTransformJob()} element={<NewJobPage />} />
      <Route path="/data-studio/transforms/jobs/:jobId" element={<JobPage />} />
    </>,
    {
      withRouter: true,
      withUndos: true,
      initialRoute: Urls.newTransformJob(),
    },
  );

  return { router, trackSimpleEvent };
}

async function getCreateRequestBodies() {
  const calls = fetchMock.callHistory.calls("path:/api/transform-job", {
    method: "POST",
  });
  return calls.map(parseBody);
}

const getJobCreatedEvents = (
  trackSimpleEvent: jest.MockedFunction<typeof Analytics.trackSimpleEvent>,
) =>
  trackSimpleEvent.mock.calls
    .map(([event]) => event)
    .filter((event) => event.event === "transform_job_created");

const getSchedulePicker = () => within(screen.getByTestId("schedule-picker"));

async function findSavedJobEditor() {
  // wait for the job page to load the saved job
  await screen.findByText("Run history");
}

describe("NewJobPage", () => {
  it("offers the default tags in the tag picker", async () => {
    setup();
    await userEvent.click(screen.getByPlaceholderText("Add tags"));
    for (const tag of DEFAULT_TAGS) {
      expect(
        await screen.findByRole("option", { name: new RegExp(`^${tag.name}`) }),
      ).toBeInTheDocument();
    }
  });

  it("creates a job with default properties and opens it", async () => {
    const { router, trackSimpleEvent } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(async () => {
      expect(await getCreateRequestBodies()).toEqual([
        {
          name: "New job",
          description: null,
          schedule: "0 0 0 * * ? *",
          ui_display_type: "cron/builder",
          tag_ids: [],
        },
      ]);
    });
    await waitFor(() =>
      expect(router?.location.pathname).toBe(Urls.transformJob(NEW_JOB_ID)),
    );
    expect(getJobCreatedEvents(trackSimpleEvent)).toEqual([
      {
        event: "transform_job_created",
        triggered_from: "transform_job_new",
        result: "success",
        target_id: NEW_JOB_ID,
      },
    ]);

    const toast = await screen.findByTestId("toast-undo");
    expect(within(toast).getByText("New job created")).toBeInTheDocument();
    await userEvent.click(within(toast).getByLabelText("close icon"));
    await waitFor(() =>
      expect(screen.queryByTestId("toast-undo")).not.toBeInTheDocument(),
    );

    await findSavedJobEditor();
    expect(screen.getByPlaceholderText("Name")).toHaveValue("New job");
    expect(getSchedulePicker().getByLabelText("Frequency")).toHaveValue(
      "daily",
    );
    expect(getSchedulePicker().getByLabelText("Time")).toHaveValue("12:00");
  });

  it("creates a job with a custom name, cron schedule, and tag", async () => {
    const { router, trackSimpleEvent } = setup();

    const nameInput = screen.getByPlaceholderText("Name");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Job");
    await userEvent.tab();

    await userEvent.click(getSchedulePicker().getByLabelText("Frequency"));
    await userEvent.click(
      await screen.findByRole("option", { name: "custom" }),
    );
    const cronInput = screen.getByPlaceholderText("For example 5 0 * Aug ?");
    await userEvent.clear(cronInput);
    await userEvent.type(cronInput, "0 * * * ?");
    await userEvent.tab();

    await userEvent.click(screen.getByPlaceholderText("Add tags"));
    await userEvent.click(
      await screen.findByRole("option", { name: /^daily/ }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(async () => {
      expect(await getCreateRequestBodies()).toEqual([
        {
          name: "Job",
          description: null,
          schedule: "0 0 * * * ? *",
          ui_display_type: "cron/raw",
          tag_ids: [2],
        },
      ]);
    });
    await waitFor(() =>
      expect(router?.location.pathname).toBe(Urls.transformJob(NEW_JOB_ID)),
    );
    expect(getJobCreatedEvents(trackSimpleEvent)).toEqual([
      {
        event: "transform_job_created",
        triggered_from: "transform_job_new",
        result: "success",
        target_id: NEW_JOB_ID,
      },
    ]);
    expect(await screen.findByText("New job created")).toBeInTheDocument();

    await findSavedJobEditor();
    expect(screen.getByPlaceholderText("Name")).toHaveValue("Job");
    expect(screen.getByPlaceholderText("For example 5 0 * Aug ?")).toHaveValue(
      "0 * * * ?",
    );
    expect(
      screen.getByText(/This job will run every hour/),
    ).toBeInTheDocument();
    expect(screen.getByText("daily")).toBeInTheDocument();
    expect(screen.queryByText("hourly")).not.toBeInTheDocument();
  });
});
