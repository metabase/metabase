import { screen } from "__support__/ui";

import type { SetupOpts } from "./setup";
import { setup as baseSetup } from "./setup";

function setup(opts: SetupOpts) {
  baseSetup({
    hasEnterprisePlugins: true,
    tokenFeatures: { whitelabel: true },
    ...opts,
  });
}

describe("ExplainerText (EE with token)", () => {
  it("should render help link when `show-metabase-links: true`", () => {
    setup({ showMetabaseLinks: true });

    expect(
      screen.getByText(
        "You can either ask users to enter values, or use the value of a dashboard filter.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Learn more.")).toBeInTheDocument();
  });

  it("should not render help link when `show-metabase-links: false`", () => {
    setup({ showMetabaseLinks: false });

    expect(
      screen.getByText(
        "You can either ask users to enter values, or use the value of a dashboard filter.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Learn more.")).not.toBeInTheDocument();
  });
});
