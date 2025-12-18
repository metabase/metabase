import { screen } from "__support__/ui";

import { type SetupOpts, setup as baseSetup } from "./setup";

function setup(opts: SetupOpts) {
  baseSetup({
    tokenFeatures: { whitelabel: true },
    enterprisePlugins: ["whitelabel"],
    ...opts,
  });
}

describe("BrowseMetrics (EE with whitelabel token)", () => {
  it("displays a link to the metrics docs when show-metabase-links = true", async () => {
    setup({ metricCount: 0, showMetabaseLinks: true });
    await screen.findByText(
      "Create Metrics to define the official way to calculate important numbers for your team",
    );
    expect(screen.getByText("Read the docs")).toBeInTheDocument();
  });

  it("does not display a link to the metrics docs when show-metabase-links = false", async () => {
    setup({ metricCount: 0, showMetabaseLinks: false });
    await screen.findByText(
      "Create Metrics to define the official way to calculate important numbers for your team",
    );
    expect(screen.queryByText("Read the docs")).not.toBeInTheDocument();
  });
});
