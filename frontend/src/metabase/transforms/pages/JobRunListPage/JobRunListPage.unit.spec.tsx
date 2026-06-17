import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import {
  setupGetTransformJobEndpoint,
  setupListJobRunTransformRunsEndpoint,
  setupListTransformJobRunsEndpoint,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  within,
} from "__support__/ui";
import type {
  TransformJobRun,
  TransformRunForJobRun,
} from "metabase-types/api";
import {
  createMockListTransformJobRunsResponse,
  createMockTransformJob,
  createMockTransformJobRun,
  createMockTransformRunForJobRun,
} from "metabase-types/api/mocks";

import { JobRunListPage } from "./JobRunListPage";

const JOB_ID = 3;

type SetupOpts = {
  runs?: TransformJobRun[];
  transformRunsByRunId?: Record<number, TransformRunForJobRun[]>;
};

function setup({ runs = [], transformRunsByRunId = {} }: SetupOpts = {}) {
  const job = createMockTransformJob({ id: JOB_ID, name: "Nightly job" });

  setupUserMetabotPermissionsEndpoint();
  setupGetTransformJobEndpoint(job);
  setupListTransformJobRunsEndpoint(
    JOB_ID,
    createMockListTransformJobRunsResponse({
      data: runs,
      total: runs.length,
    }),
  );
  Object.entries(transformRunsByRunId).forEach(([runId, transformRuns]) => {
    setupListJobRunTransformRunsEndpoint(JOB_ID, Number(runId), transformRuns);
  });
  mockGetBoundingClientRect({ width: 1200, height: 800 });

  const path = "/data-studio/transforms/jobs/:jobId/runs";
  const initialRoute = `/data-studio/transforms/jobs/${JOB_ID}/runs`;

  renderWithProviders(<Route path={path} component={JobRunListPage} />, {
    withRouter: true,
    initialRoute,
  });
}

describe("JobRunListPage", () => {
  it("renders job runs with the job name and tabs", async () => {
    setup({
      runs: [createMockTransformJobRun({ id: 5, status: "succeeded" })],
    });

    expect(await screen.findAllByText("Nightly job")).not.toHaveLength(0);
    expect(
      screen.getByRole("link", { name: "Run history" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Success")).toBeInTheDocument();
  });

  it("shows an empty state when there are no runs", async () => {
    setup({ runs: [] });
    expect(await screen.findByText("No runs yet")).toBeInTheDocument();
  });

  it("opens the sidebar with the constituent transform runs on row click", async () => {
    const run = createMockTransformJobRun({ id: 5, status: "succeeded" });
    setup({
      runs: [run],
      transformRunsByRunId: {
        5: [
          createMockTransformRunForJobRun({
            id: 17,
            status: "succeeded",
            transform_name: "transform_2",
          }),
        ],
      },
    });

    const row = await screen.findByRole("row", { name: /Success/ });
    await userEvent.click(row);

    const sidebar = await screen.findByTestId("job-run-list-sidebar");
    expect(within(sidebar).getByText("transform_2")).toBeInTheDocument();
  });

  it("renders the error section for a failed transform run in the sidebar", async () => {
    const run = createMockTransformJobRun({ id: 8, status: "failed" });
    setup({
      runs: [run],
      transformRunsByRunId: {
        8: [
          createMockTransformRunForJobRun({
            id: 21,
            status: "failed",
            transform_name: "broken_transform",
            message: 'relation "abc" does not exist',
          }),
        ],
      },
    });

    const row = await screen.findByRole("row", { name: /Failed/ });
    await userEvent.click(row);

    expect(
      await screen.findByRole("region", { name: "Error" }),
    ).toBeInTheDocument();
  });
});
