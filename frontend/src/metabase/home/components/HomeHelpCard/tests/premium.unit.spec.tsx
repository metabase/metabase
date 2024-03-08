import { screen } from "__support__/ui";

import type { SetupOpts } from "./setup";
import { setup as baseSetup } from "./setup";

function setup(opts: SetupOpts = {}) {
  return baseSetup({
    hasEnterprisePlugins: true,
    ...opts,
    tokenFeatures: { whitelabel: true },
  });
}

describe("HomeHelpCard (EE with token)", () => {
  it("should show the customized application name", () => {
    setup({ applicationName: "My app analytics" });
    expect(screen.getByText("My app analytics tips")).toBeInTheDocument();
  });

  it("should render help link when `show-metabase-links: true`", () => {
    setup({ showMetabaseLinks: true });
    expect(screen.getByText("Metabase tips")).toBeInTheDocument();
  });

  it("should not render help link when `show-metabase-links: false`", () => {
    setup({ showMetabaseLinks: false });
    expect(screen.queryByText("Metabase tips")).not.toBeInTheDocument();
  });
});
