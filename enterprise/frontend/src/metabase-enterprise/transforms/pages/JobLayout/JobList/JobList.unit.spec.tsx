import { Route } from "react-router";

import {
  setupListTransformJobTransformsEndpoint,
  setupListTransformJobTransformsEndpointWithError,
  setupListTransformJobsEndpoint,
  setupListTransformTagsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import * as Urls from "metabase/lib/urls";
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
  params?: Urls.TransformJobListParams;
};

function setup({
  jobs = [],
  jobTransforms = new Map(),
  tags = [],
  params,
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
      path={Urls.transformJobList(params)}
      component={() => <JobList />}
    />,
    { withRouter: true, initialRoute: Urls.transformJobList(params) },
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
    expect(
      await screen.findByText("Last run: Jan 1, 2000 12:00 AM"),
    ).toBeInTheDocument();
  });

  it("should show Failed status if a job failed", async () => {
    const jobId = 1;

    setup({
      jobs: [
        createMockTransformJob({
          id: jobId,
          last_run: createMockTransformRun({ status: "failed" }),
        }),
      ],
      jobTransforms: new Map([[jobId, { data: [createMockTransform()] }]]),
    });

    expect(
      await screen.findByText("Failed: Jan 1, 2000 12:00 AM"),
    ).toBeInTheDocument();
  });
});
