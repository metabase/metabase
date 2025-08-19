import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import {
  setupCreateTransformJobEndpoint,
  setupGetTransformJobEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { TransformJob } from "metabase-types/api";
import { createMockTransformJob } from "metabase-types/api/mocks";

import { getJobListUrl, getJobUrl, getNewJobUrl } from "../../../urls";

import { SaveSection } from "./SaveSection";

type SetupOpts = {
  job?: TransformJob;
};

function setup({ job = createMockTransformJob() }: SetupOpts = {}) {
  setupCreateTransformJobEndpoint(job);
  setupGetTransformJobEndpoint(job);

  renderWithProviders(
    <>
      <Route
        path={getNewJobUrl()}
        component={() => <SaveSection job={job} />}
      />
      <Route path={getJobUrl(job.id)} component={() => <div>Job page</div>} />
      <Route
        path={getJobListUrl()}
        component={() => <div>Job list page</div>}
      />
    </>,
    { withRouter: true, initialRoute: getNewJobUrl() },
  );
}

describe("SaveSection", () => {
  it("should allow to save a job", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Job page")).toBeInTheDocument();
  });

  it("should allow to cancel creation", async () => {
    setup();
    await userEvent.click(screen.getByRole("link", { name: "Cancel" }));
    expect(await screen.findByText("Job list page")).toBeInTheDocument();
  });
});
