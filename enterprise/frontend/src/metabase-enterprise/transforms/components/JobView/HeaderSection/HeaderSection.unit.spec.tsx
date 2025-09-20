import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockTransformJob } from "metabase-types/api/mocks";

import type { TransformJobInfo } from "../types";

import { HeaderSection } from "./HeaderSection";

type SetupOpts = {
  job?: TransformJobInfo;
};

function setup({ job = createMockTransformJob() }: SetupOpts = {}) {
  renderWithProviders(
    <Route path="/" component={() => <HeaderSection job={job} />} />,
    { withRouter: true },
  );
}

describe("HeaderSection", () => {
  it("should render links", () => {
    setup({ job: createMockTransformJob({ name: "Daily job" }) });
    expect(screen.getByRole("link", { name: "Jobs" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Daily job" })).toBeInTheDocument();
  });
});
