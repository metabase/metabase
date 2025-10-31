import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import {
  setupCreateTransformJobEndpoint,
  setupGetTransformJobEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import * as Urls from "metabase/lib/urls";
import type { TransformJob } from "metabase-types/api";
import { createMockTransformJob } from "metabase-types/api/mocks";

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
        path={Urls.newTransformJob()}
        component={() => <SaveSection job={job} />}
      />
      <Route
        path={Urls.transformJob(job.id)}
        component={() => <div>Job page</div>}
      />
      <Route
        path={Urls.transformJobList()}
        component={() => <div>Job list page</div>}
      />
    </>,
    { withRouter: true, initialRoute: Urls.newTransformJob() },
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
