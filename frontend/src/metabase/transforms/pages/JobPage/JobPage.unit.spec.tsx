import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { setupDatabaseListEndpoint } from "__support__/server-mocks";
import {
  setupGetTransformJobEndpoint,
  setupListTransformJobTransformsEndpoint,
  setupListTransformTagsEndpoint,
} from "__support__/server-mocks/transform";
import { renderWithProviders, screen, within } from "__support__/ui";
import * as Urls from "metabase/urls";
import type { Transform, TransformJob } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTransformJob,
} from "metabase-types/api/mocks";

import { JobPage } from "./JobPage";

type Deferred = {
  promise: Promise<Transform[]>;
  resolve: (transforms: Transform[]) => void;
};

function deferred(): Deferred {
  let resolve!: (transforms: Transform[]) => void;
  const promise = new Promise<Transform[]>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

type SetupOpts = {
  job?: TransformJob;
  // When provided, the transform plan endpoint stays pending until the deferred
  // is resolved, simulating the slow (10+ seconds) response
  pendingTransforms?: Deferred;
};

function setup({
  job = createMockTransformJob({ id: 1, name: "My Job" }),
  pendingTransforms,
}: SetupOpts = {}) {
  setupGetTransformJobEndpoint(job);
  setupDatabaseListEndpoint([createMockDatabase()]);
  setupListTransformTagsEndpoint([]);

  if (pendingTransforms) {
    fetchMock.get(
      `path:/api/transform-job/${job.id}/transforms`,
      pendingTransforms.promise,
    );
  } else {
    setupListTransformJobTransformsEndpoint(job.id, []);
  }

  const path = Urls.transformJob(job.id);
  renderWithProviders(
    <Route path="/data-studio/transforms/jobs/:jobId" component={JobPage} />,
    { withRouter: true, initialRoute: path },
  );
}

describe("JobPage", () => {
  it("renders the job details before the transform plan resolves", async () => {
    const pendingTransforms = deferred();
    setup({ pendingTransforms });

    // The job header and its details render without waiting for the slow
    // transforms endpoint, which is still pending here.
    const header = await screen.findByTestId("jobs-header");
    expect(within(header).getByDisplayValue("My Job")).toBeInTheDocument();
    expect(screen.getByText("Transforms")).toBeInTheDocument();

    // The transforms list itself has not loaded yet, and editing stays locked
    // while permissions are still being checked.
    expect(
      screen.queryByText("There are no transforms for this job."),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("run-button")).toBeDisabled();

    pendingTransforms.resolve([]);
    expect(
      await screen.findByText("There are no transforms for this job."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("run-button")).toBeEnabled();
  });
});
