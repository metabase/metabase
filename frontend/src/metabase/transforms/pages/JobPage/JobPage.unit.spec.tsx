import {
  setupDatabaseListEndpoint,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import {
  setupGetTransformJobEndpoint,
  setupListTransformJobTransformsEndpoint,
  setupListTransformTagsEndpoint,
} from "__support__/server-mocks/transform";
import { act, renderWithProviders, screen, within } from "__support__/ui";
import { Route } from "metabase/router";
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
  setupUserMetabotPermissionsEndpoint();
  setupListTransformJobTransformsEndpoint(job.id, [], {
    delay: transformsDelay,
  });

  const path = Urls.transformJob(job.id);
  renderWithProviders(
    <Route path="/data-studio/transforms/jobs/:jobId" element={<JobPage />} />,
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

    const header = await screen.findByTestId("jobs-header");
    expect(within(header).getByDisplayValue("My Job")).toBeInTheDocument();
    expect(screen.getByText("Transforms")).toBeInTheDocument();

    expect(
      screen.queryByText("There are no transforms for this job."),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("run-button")).toBeEnabled();

    act(() => {
      jest.advanceTimersByTime(TRANSFORMS_DELAY);
    });

    expect(
      await screen.findByText("There are no transforms for this job."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("run-button")).toBeEnabled();
  });
});
