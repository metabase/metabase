import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
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
  waitFor,
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
  initialRoute?: string;
};

function setup({
  runs = [],
  transformRunsByRunId = {},
  initialRoute = `/data-studio/transforms/jobs/${JOB_ID}/runs`,
}: SetupOpts = {}) {
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

  renderWithProviders(<Route path={path} component={JobRunListPage} />, {
    withRouter: true,
    initialRoute,
  });
}

function getLastRunsRequestParams() {
  const call = fetchMock.callHistory.lastCall(
    `path:/api/transform-job/${JOB_ID}/runs`,
  );
  if (!call) {
    throw new Error("Expected a request to the job runs endpoint");
  }
  return new URL(call.url).searchParams;
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
    expect(await within(sidebar).findByText("transform_2")).toBeInTheDocument();
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

  describe("filters", () => {
    it("filters by status", async () => {
      setup({
        runs: [createMockTransformJobRun({ id: 5, status: "succeeded" })],
      });
      await screen.findByText("Success");

      await userEvent.click(screen.getByLabelText("Status"));
      await userEvent.click(
        await screen.findByRole("option", { name: "Failed" }),
      );

      await waitFor(() => {
        expect(getLastRunsRequestParams().get("status")).toBe("failed");
      });
    });

    it("filters by trigger (run method)", async () => {
      setup({
        runs: [createMockTransformJobRun({ id: 5, status: "succeeded" })],
      });
      await screen.findByText("Success");

      await userEvent.click(screen.getByLabelText("Trigger"));
      await userEvent.click(
        await screen.findByRole("option", { name: "Manual" }),
      );

      await waitFor(() => {
        expect(getLastRunsRequestParams().get("run-method")).toBe("manual");
      });
    });

    it("filters by start time", async () => {
      setup({
        runs: [createMockTransformJobRun({ id: 5, status: "succeeded" })],
      });
      await screen.findByText("Success");

      await userEvent.click(screen.getByLabelText("Started at"));
      await userEvent.click(
        await screen.findByRole("option", { name: "Previous 7 days" }),
      );

      await waitFor(() => {
        expect(getLastRunsRequestParams().get("start-time")).toBe("past7days");
      });
    });

    it("sends active filters from the URL in the request", async () => {
      setup({
        runs: [],
        initialRoute: `/data-studio/transforms/jobs/${JOB_ID}/runs?status=failed&run-method=manual&start-time=past7days`,
      });

      // With filters applied, the empty state reflects "not found" rather than "none yet".
      expect(await screen.findByText("No runs found")).toBeInTheDocument();

      const params = getLastRunsRequestParams();
      expect(params.get("status")).toBe("failed");
      expect(params.get("run-method")).toBe("manual");
      expect(params.get("start-time")).toBe("past7days");
    });
  });
});
