import { screen } from "__support__/ui";

import type { SetupOpts } from "./setup";
import { setup as baseSetup } from "./setup";

function setup(opts: SetupOpts = {}) {
  return baseSetup({ hasEnterprisePlugins: true, ...opts });
}

describe("HomeHelpCard (EE without token)", () => {
  it("should show Metabase despite customizing the application name", () => {
    setup({ applicationName: "My app analytics" });
    expect(screen.getByText("Metabase tips")).toBeInTheDocument();
  });

  it("should render help link when `show-metabase-links: true`", () => {
    setup({ showMetabaseLinks: true });
    expect(screen.getByText("Metabase tips")).toBeInTheDocument();
  });

  it("should render help link when `show-metabase-links: false`", () => {
    setup({ showMetabaseLinks: false });
    expect(screen.getByText("Metabase tips")).toBeInTheDocument();
  });
});
