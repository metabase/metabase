import { screen } from "__support__/ui";
import { setup as baseSetup } from "./setup";
import type { SetupOpts } from "./setup";

function setup(opts: SetupOpts = {}) {
  return baseSetup({ hasEnterprisePlugins: true, ...opts });
}

describe("HomeHelpCard (EE without token)", () => {
  it("should render correctly", () => {
    setup();
    expect(screen.getByText("Metabase tips")).toBeInTheDocument();
  });

  it("should show Metabase despite customizing the application name", () => {
    setup({ applicationName: "My app analytics" });
    expect(screen.getByText("Metabase tips")).toBeInTheDocument();
  });

  it("should render despite hiding the Metabase links", () => {
    setup({ showMetabaseLinks: false });
    expect(screen.getByText("Metabase tips")).toBeInTheDocument();
  });
});
