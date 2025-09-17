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
} from "metabase-types/api/mocks";

import { JobList } from "./JobList";

type SetupOpts = {
  jobs?: TransformJob[];
  jobTransforms?: Map<TransformJobId, Transform[] | null>;
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

  jobTransforms.forEach((transforms, jobId) => {
    if (transforms != null) {
      setupListTransformJobTransformsEndpoint(jobId, transforms);
    } else {
      setupListTransformJobTransformsEndpointWithError(jobId);
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
  it("should show the number of transforms per job", async () => {
    const job1Id = 1;
    const job2Id = 2;
    setup({
      jobs: [
        createMockTransformJob({ id: job1Id, name: "Job1" }),
        createMockTransformJob({ id: job2Id, name: "Job2" }),
      ],
      jobTransforms: new Map([
        [job1Id, [createMockTransform(), createMockTransform()]],
        [job2Id, [createMockTransform()]],
      ]),
    });

    const job1Row = await screen.findByRole("row", { name: /Job1/ });
    const job2Row = await screen.findByRole("row", { name: /Job2/ });
    expect(await within(job1Row).findByText("2")).toBeInTheDocument();
    expect(await within(job2Row).findByText("1")).toBeInTheDocument();
  });

  it("should show errors when loading transforms", async () => {
    const job1Id = 1;
    setup({
      jobs: [createMockTransformJob({ id: job1Id, name: "Job1" })],
      jobTransforms: new Map([[job1Id, null]]),
    });

    const jobRow = await screen.findByRole("row", { name: /Job1/ });
    const warningIcon = await within(jobRow).findByLabelText("warning icon");
    await userEvent.hover(warningIcon);

    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
  });
});
