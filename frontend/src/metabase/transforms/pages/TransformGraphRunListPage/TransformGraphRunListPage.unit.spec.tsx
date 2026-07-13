import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCancelJobRunEndpoint,
  setupListDagRunTransformRunsEndpoint,
  setupListJobRunTransformRunsEndpoint,
  setupListTransformGraphRunsEndpoint,
  setupListTransformsEndpoint,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { Route } from "metabase/router";
import type { TransformGraphRun } from "metabase-types/api";
import {
  createMockListTransformGraphRunsResponse,
  createMockTransformGraphRun,
  createMockTransformRunForJobRun,
} from "metabase-types/api/mocks";

import { TransformGraphRunListPage } from "./TransformGraphRunListPage";

type SetupOpts = {
  runs?: TransformGraphRun[];
  initialRoute?: string;
};

function setup({
  runs = [],
  initialRoute = "/data-studio/transforms/runs",
}: SetupOpts = {}) {
  setupUserMetabotPermissionsEndpoint();
  setupListTransformsEndpoint([]);
  setupListTransformGraphRunsEndpoint(
    createMockListTransformGraphRunsResponse({
      data: runs,
      total: runs.length,
    }),
  );
  mockGetBoundingClientRect({ width: 1200, height: 800 });

  renderWithProviders(
    <Route
      path="/data-studio/transforms/runs"
      component={TransformGraphRunListPage}
    />,
    { withRouter: true, initialRoute },
  );
}

const JOB_RUN = createMockTransformGraphRun({
  run_type: "job",
  id: 101,
  entity_id: 1,
  name: "Hourly refresh",
  run_method: "cron",
});

const DAG_RUN = createMockTransformGraphRun({
  run_type: "dag",
  id: 202,
  entity_id: 12,
  name: "Customers deduped",
  direction: "upstream",
  status: "failed",
});

const TRANSFORM_RUN = createMockTransformGraphRun({
  run_type: "transform",
  id: 301,
  entity_id: 20,
  name: "Products normalized",
});

describe("TransformGraphRunListPage", () => {
  it("renders job, DAG, and standalone runs with a Run name and Type", async () => {
    setup({ runs: [JOB_RUN, DAG_RUN, TRANSFORM_RUN] });

    expect(await screen.findByText("Hourly refresh")).toBeInTheDocument();
    expect(
      screen.getByText("Upstream → Customers deduped"),
    ).toBeInTheDocument();
    expect(screen.getByText("Products normalized")).toBeInTheDocument();

    const table = screen.getByRole("treegrid", { name: "Runs" });
    expect(within(table).getByText("Job")).toBeInTheDocument();
    expect(within(table).getAllByText("Transformation")).toHaveLength(2);
  });

  it("greys a deleted-entity run and hides the Transforms section for a deleted job", async () => {
    const deletedJobRun = createMockTransformGraphRun({
      run_type: "job",
      id: 103,
      entity_id: null,
      name: "Removed job",
      run_method: "cron",
    });
    setup({ runs: [deletedJobRun] });

    const name = await screen.findByText("Removed job");
    await userEvent.hover(name);
    expect(
      await screen.findByText("Removed job has been deleted"),
    ).toBeInTheDocument();

    await userEvent.click(name);
    const sidebar = await screen.findByTestId("transform-graph-run-sidebar");

    expect(within(sidebar).queryByText("Transforms")).not.toBeInTheDocument();
    expect(
      within(sidebar).queryByRole("link", { name: "View this job" }),
    ).not.toBeInTheDocument();
  });

  it("still shows member transforms for a DAG run whose seed transform was deleted", async () => {
    const deletedDagRun = createMockTransformGraphRun({
      run_type: "dag",
      id: 205,
      entity_id: null,
      name: "Removed seed",
      direction: "upstream",
      status: "succeeded",
    });
    setupListDagRunTransformRunsEndpoint(205, [
      createMockTransformRunForJobRun({
        id: 1,
        transform_name: "Orders cleaned",
        status: "succeeded",
      }),
    ]);
    setup({ runs: [deletedDagRun] });

    await userEvent.click(await screen.findByText("Upstream → Removed seed"));

    const sidebar = await screen.findByTestId("transform-graph-run-sidebar");

    expect(within(sidebar).getByText("Transforms")).toBeInTheDocument();
    expect(
      await within(sidebar).findByText("Orders cleaned"),
    ).toBeInTheDocument();
  });

  it("drills into a DAG run's member transforms via the dag-run endpoint", async () => {
    setupListDagRunTransformRunsEndpoint(202, [
      createMockTransformRunForJobRun({
        id: 1,
        transform_name: "Orders cleaned",
        status: "succeeded",
      }),
      createMockTransformRunForJobRun({
        id: 2,
        transform_name: "Customers deduped",
        status: "failed",
        message: "boom",
      }),
    ]);
    setup({ runs: [DAG_RUN] });

    await userEvent.click(
      await screen.findByText("Upstream → Customers deduped"),
    );

    const sidebar = await screen.findByTestId("transform-graph-run-sidebar");
    expect(
      await within(sidebar).findByText("Orders cleaned"),
    ).toBeInTheDocument();

    expect(
      within(sidebar).getByRole("region", { name: "Error" }),
    ).toBeInTheDocument();

    expect(
      within(sidebar).getByRole("link", { name: "View this transform" }),
    ).toHaveAttribute("href", "/data-studio/transforms/12");
  });

  it("shows a standalone transform run as its own single member (no fetch)", async () => {
    setup({ runs: [TRANSFORM_RUN] });

    await userEvent.click(await screen.findByText("Products normalized"));

    const sidebar = await screen.findByTestId("transform-graph-run-sidebar");
    const member = within(sidebar).getByTestId("transform-run-item");
    expect(member).toHaveTextContent("Products normalized");
  });

  it("cancels an in-progress job run via the job-run cancel endpoint", async () => {
    const startedJob = createMockTransformGraphRun({
      run_type: "job",
      id: 102,
      entity_id: 2,
      name: "Nightly rollups",
      run_method: "cron",
      status: "started",
    });
    setupListJobRunTransformRunsEndpoint(2, 102, [
      createMockTransformRunForJobRun({ id: 5, transform_name: "Step" }),
    ]);
    setupCancelJobRunEndpoint(2, 102);
    setup({ runs: [startedJob] });

    await userEvent.click(await screen.findByText("Nightly rollups"));

    const sidebar = await screen.findByTestId("transform-graph-run-sidebar");
    expect(
      within(sidebar).getByRole("link", { name: "View this job" }),
    ).toHaveAttribute("href", "/data-studio/transforms/jobs/2");

    await userEvent.click(
      within(sidebar).getByRole("button", { name: "Cancel run" }),
    );

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel run" }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          "path:/api/transform-job/2/runs/102/cancel",
        ),
      ).toBe(true);
    });
  });
});
