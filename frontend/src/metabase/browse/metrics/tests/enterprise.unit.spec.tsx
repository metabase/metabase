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
      "Create Metrics to define the official way to calculate important numbers for your team",
    );
    expect(screen.getByText("Read the docs")).toBeInTheDocument();
  });

  it("displays a link to the metrics docs when show-metabase-links = false", async () => {
    // Still show the link on enterprise, because disabling metabase links is not supported
    setup({ metricCount: 0, showMetabaseLinks: false });
    await screen.findByText(
      "Create Metrics to define the official way to calculate important numbers for your team",
    );
    expect(screen.getByText("Read the docs")).toBeInTheDocument();
  });
});
