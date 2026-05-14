import { Route } from "react-router";

import {
  setupListTransformJobTransformsEndpoint,
  setupListTransformTagsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { TransformJob } from "metabase-types/api";
import { createMockTransformJob } from "metabase-types/api/mocks";

import { JobEditor } from "./JobEditor";

function setup({
  job = createMockTransformJob(),
}: { job?: TransformJob } = {}) {
  setupListTransformTagsEndpoint([]);
  setupListTransformJobTransformsEndpoint(job.id, []);
  renderWithProviders(
    <Route
      path="/"
      component={() => (
        <JobEditor
          job={job}
          onNameChange={jest.fn()}
          onScheduleChange={jest.fn()}
          onTagListChange={jest.fn()}
        />
      )}
    />,
    { withRouter: true, initialRoute: "/" },
  );
}

describe("JobEditor", () => {
  it("does not render a Disabled badge when the job is enabled", () => {
    setup({ job: createMockTransformJob({ active: true }) });
    expect(screen.queryByText("Disabled")).not.toBeInTheDocument();
  });

  it("renders a Disabled badge when the job is disabled", () => {
    setup({ job: createMockTransformJob({ active: false }) });
    expect(screen.getByText("Disabled")).toBeInTheDocument();
  });
});
