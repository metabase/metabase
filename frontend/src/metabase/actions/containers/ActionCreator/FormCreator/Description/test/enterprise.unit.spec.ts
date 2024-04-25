import { screen } from "__support__/ui";

import type { SetupOpts } from "./setup";
import { setup as baseSetup } from "./setup";

function setup(opts: SetupOpts) {
  return baseSetup({
    hasEnterprisePlugins: true,
    ...opts,
  });
}

describe("FormCerator > Description (EE without token)", () => {
  it("should show a help link when `show-metabase-links: true`", () => {
    setup({ showMetabaseLinks: true });

    expect(
      screen.getByText(
        "Configure your parameters' types and properties here. The values for these parameters can come from user input, or from a dashboard filter.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Learn more")).toBeInTheDocument();
  });

  it("should show a help link when `show-metabase-links: false`", () => {
    setup({ showMetabaseLinks: false });

    expect(
      screen.getByText(
        "Configure your parameters' types and properties here. The values for these parameters can come from user input, or from a dashboard filter.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Learn more")).toBeInTheDocument();
  });
});
