import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import {
  setupListTransformJobTransformsEndpoint,
  setupListTransformJobTransformsEndpointWithError,
  setupListTransformJobsEndpoint,
  setupListTransformTagsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import type { JobListParams } from "metabase-enterprise/transforms/types";
import { getJobListUrl } from "metabase-enterprise/transforms/urls";
import type {
  Transform,
  TransformJob,
  TransformJobId,
  TransformTag,
} from "metabase-types/api";
import {
  createMockTransform,
  createMockTransformJob,
  createMockTransformRun,
} from "metabase-types/api/mocks";

import { JobList } from "./JobList";

type TransformListInfo = {
  data: Transform[];
  error?: unknown;
};

type SetupOpts = {
  jobs?: TransformJob[];
  jobTransforms?: Map<TransformJobId, TransformListInfo>;
  tags?: TransformTag[];
  params?: JobListParams;
};

function setup({
  jobs = [],
  jobTransforms = new Map(),
  tags = [],
  params = {},
}: SetupOpts) {
  setupListTransformJobsEndpoint(jobs);
  setupListTransformTagsEndpoint(tags);

  jobTransforms.forEach(({ data, error }, jobId) => {
    if (error != null) {
      setupListTransformJobTransformsEndpointWithError(jobId, error);
    } else {
      setupListTransformJobTransformsEndpoint(jobId, data);
    }
  });

  renderWithProviders(
    <Route
      path={getJobListUrl(params)}
      component={() => <JobList params={params} />}
    />,
    { withRouter: true, initialRoute: getJobListUrl(params) },
  );
}

describe("JobList", () => {
  it("should show the last run status", async () => {
    const jobId = 1;
    setup({
      jobs: [
        createMockTransformJob({
          id: jobId,
          last_run: createMockTransformRun({ status: "started" }),
        }),
      ],
      jobTransforms: new Map([[jobId, { data: [createMockTransform()] }]]),
    });
    expect(await screen.findByText("In progress")).toBeInTheDocument();
  });

  it("should show the number of transforms per job", async () => {
    const job1Id = 1;
    const job2Id = 2;
    setup({
      jobs: [
        createMockTransformJob({ id: job1Id, name: "Job1" }),
        createMockTransformJob({ id: job2Id, name: "Job2" }),
      ],
      jobTransforms: new Map([
        [job1Id, { data: [createMockTransform(), createMockTransform()] }],
        [job2Id, { data: [createMockTransform()] }],
      ]),
    });

    const job1Row = await screen.findByRole("row", { name: /Job1/ });
    const job2Row = await screen.findByRole("row", { name: /Job2/ });
    expect(await within(job1Row).findByText("2")).toBeInTheDocument();
    expect(await within(job2Row).findByText("1")).toBeInTheDocument();
  });

  it("should show BE errors when loading transforms", async () => {
    const jobId = 1;
    const errorMessage = "Custom error";

    setup({
      jobs: [createMockTransformJob({ id: jobId, name: "Job1" })],
      jobTransforms: new Map([
        [
          jobId,
          { data: [createMockTransform()], error: { message: errorMessage } },
        ],
      ]),
    });

    const jobRow = await screen.findByRole("row", { name: /Job1/ });
    const warningIcon = await within(jobRow).findByLabelText("warning icon");
    await userEvent.hover(warningIcon);

    expect(await screen.findByText(errorMessage)).toBeInTheDocument();
  });
});
