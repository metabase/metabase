import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { setupDeleteTransformJobEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { TransformJob } from "metabase-types/api";
import { createMockTransformJob } from "metabase-types/api/mocks";

import { getJobListUrl, getJobUrl } from "../../../urls";

import { ManageSection } from "./ManageSection";

type SetupOpts = {
  job?: TransformJob;
};

function setup({ job = createMockTransformJob() }: SetupOpts = {}) {
  setupDeleteTransformJobEndpoint(job.id);

  renderWithProviders(
    <>
      <Route path={getJobListUrl()} component={() => <div>Job list</div>} />
      <Route
        path={getJobUrl(job.id)}
        component={() => <ManageSection job={job} />}
      />
    </>,
    { withRouter: true, initialRoute: getJobUrl(job.id) },
  );
}

describe("ManageSection", () => {
  it("should delete the job and navigate to the job list page", async () => {
    setup();
    await userEvent.click(
      screen.getByRole("button", { name: "Delete this job" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete job" }));
    expect(await screen.findByText("Job list")).toBeInTheDocument();
  });
});
