import { screen } from "__support__/ui";

import { type SetupOpts, setup as baseSetup } from "./setup";

function setup(opts: SetupOpts = {}) {
  baseSetup({
    tokenFeatures: { whitelabel: true },
    enterprisePlugins: ["whitelabel"],
    ...opts,
  });
}

describe("MetricEditorSidebar (EE with a whitelabel token)", () => {
  it("should render the metric docs link by default", () => {
    setup({ showMetabaseLinks: true });
    expect(screen.getByRole("link", { name: /Docs/ })).toBeInTheDocument();
  });

  it("should not render the metric docs link when the setting is turned off", () => {
    setup({ showMetabaseLinks: false });
    expect(
      screen.queryByRole("link", { name: /Docs/ }),
    ).not.toBeInTheDocument();
  });
});
