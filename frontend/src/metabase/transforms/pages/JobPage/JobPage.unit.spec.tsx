import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { setupDatabaseListEndpoint } from "__support__/server-mocks";
import {
  setupGetTransformJobEndpoint,
  setupListTransformTagsEndpoint,
} from "__support__/server-mocks/transform";
import { act, renderWithProviders, screen, within } from "__support__/ui";
import * as Urls from "metabase/urls";
import type { TransformJob } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTransformJob,
} from "metabase-types/api/mocks";

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
  fetchMock.get(`path:/api/transform-job/${job.id}/transforms`, [], {
    delay: transformsDelay,
  });

  const path = Urls.transformJob(job.id);
  renderWithProviders(
    <Route path="/data-studio/transforms/jobs/:jobId" component={JobPage} />,
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
