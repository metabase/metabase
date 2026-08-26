import {
  setupListJobRunTransformRunsEndpoint,
  setupListTransformJobTransformsEndpoint,
  setupListTransformTagsEndpoint,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  within,
} from "__support__/ui";
import { Route } from "metabase/router";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import type {
  Transform,
  TransformJob,
  TransformRunForJobRun,
} from "metabase-types/api";
import {
  createMockTransform,
  createMockTransformJob,
  createMockTransformRun,
  createMockTransformRunForJobRun,
} from "metabase-types/api/mocks";

import { JobEditor } from "./JobEditor";

function setup({
  job = createMockTransformJob(),
  transforms = [],
  transformRuns = [],
}: {
  job?: TransformJob;
  transforms?: Transform[];
  transformRuns?: TransformRunForJobRun[];
} = {}) {
  // TreeTable virtualizes rows, so the container needs a measurable size
  mockGetBoundingClientRect({ width: 800, height: 600 });
  setupListTransformTagsEndpoint([]);
  setupListTransformJobTransformsEndpoint(job.id, transforms);
  if (job.last_run) {
    setupListJobRunTransformRunsEndpoint(
      job.id,
      job.last_run.id,
      transformRuns,
    );
  }
  renderWithProviders(
    <Route
      path="/"
      element={
        <JobEditor
          job={job}
          onNameChange={jest.fn()}
          onScheduleChange={jest.fn()}
          onTagListChange={jest.fn()}
        />
      }
    />,
    { withRouter: true, initialRoute: "/" },
  );
}

const getTransformRow = (transformName: string) =>
  within(screen.getByRole("row", { name: new RegExp(transformName) }));

describe("JobEditor", () => {
  it("does not render a Disabled badge when the job is enabled", () => {
    setup({ job: createMockTransformJob({ active: true }) });
    expect(screen.queryByText("Disabled")).not.toBeInTheDocument();
  });

  it("renders a Disabled badge when the job is disabled", () => {
    setup({ job: createMockTransformJob({ active: false }) });
    expect(screen.getByText("Disabled")).toBeInTheDocument();
  });

  describe("run status column", () => {
    const transforms = [
      createMockTransform({ id: 1, name: "First transform" }),
      createMockTransform({ id: 2, name: "Second transform" }),
      createMockTransform({ id: 3, name: "Third transform" }),
    ];

    it("renders empty statuses when the job has never been run", async () => {
      setup({ job: createMockTransformJob({ last_run: null }), transforms });
      await screen.findByRole("row", { name: /First transform/ });

      expect(
        screen.getByRole("columnheader", { name: "Status" }),
      ).toBeInTheDocument();
      transforms.forEach((transform) => {
        expect(
          getTransformRow(transform.name).getByText(EMPTY_CELL_PLACEHOLDER),
        ).toBeInTheDocument();
      });
    });

    it("renders the status of each transform in the last run", async () => {
      setup({
        job: createMockTransformJob({
          last_run: createMockTransformRun({ id: 10, status: "started" }),
        }),
        transforms,
        transformRuns: [
          createMockTransformRunForJobRun({
            id: 1,
            job_run_id: 10,
            transform_id: 1,
            status: "succeeded",
          }),
          createMockTransformRunForJobRun({
            id: 2,
            job_run_id: 10,
            transform_id: 2,
            status: "started",
          }),
        ],
      });
      await screen.findByRole("row", { name: /First transform/ });

      expect(
        getTransformRow("First transform").getByText("Success"),
      ).toBeInTheDocument();
      expect(
        getTransformRow("Second transform").getByText("In progress"),
      ).toBeInTheDocument();
      expect(
        getTransformRow("Third transform").getByText(EMPTY_CELL_PLACEHOLDER),
      ).toBeInTheDocument();
    });

    it("renders failures from a finished run", async () => {
      setup({
        job: createMockTransformJob({
          last_run: createMockTransformRun({ id: 10, status: "failed" }),
        }),
        transforms,
        transformRuns: [
          createMockTransformRunForJobRun({
            id: 1,
            job_run_id: 10,
            transform_id: 1,
            status: "failed",
          }),
        ],
      });
      await screen.findByRole("row", { name: /First transform/ });

      expect(
        getTransformRow("First transform").getByText("Failed"),
      ).toBeInTheDocument();
    });
  });
});
