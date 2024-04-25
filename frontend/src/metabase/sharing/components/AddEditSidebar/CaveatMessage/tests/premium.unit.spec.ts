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

describe("CaveatMessage (EE with token)", () => {
  it("should show a help link when `show-metabase-links: true`", () => {
    setup({ showMetabaseLinks: true });

    expect(
      screen.getByText(
        "Recipients will see this data just as you see it, regardless of their permissions.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Learn more.")).toBeInTheDocument();
  });

  it("should not show a help link when `show-metabase-links: false`", () => {
    setup({ showMetabaseLinks: false });

    expect(
      screen.getByText(
        "Recipients will see this data just as you see it, regardless of their permissions.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Learn more.")).not.toBeInTheDocument();
  });
});
