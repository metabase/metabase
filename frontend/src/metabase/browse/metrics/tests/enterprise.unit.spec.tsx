import { screen } from "__support__/ui";

import { type SetupOpts, setup as baseSetup } from "./setup";

function setup(opts: SetupOpts) {
  baseSetup({
    hasEnterprisePlugins: true,
    ...opts,
  });
}

describe("BrowseMetrics (EE without token)", () => {
  it("displays a link to the metrics docs when show-metabase-links = true", async () => {
    setup({ metricCount: 0, showMetabaseLinks: true });
    await screen.findByText(
      "Metrics help you summarize and analyze your data effortlessly.",
    );
    expect(screen.getByText("Read the docs")).toBeInTheDocument();
  });
  it("displays a link to the metrics docs when show-metabase-links = false", async () => {
    setup({ metricCount: 0, showMetabaseLinks: false });
    await screen.findByText(
      "Metrics help you summarize and analyze your data effortlessly.",
    );
    expect(screen.getByText("Read the docs")).toBeInTheDocument();
  });
});
