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

describe("DashCardParameterMapper > DisabledNativeCardHelpText (EE with token)", () => {
  it("should show a parameter help link when `show-metabase-links: true`", () => {
    setup({ showMetabaseLinks: true });

    expect(
      screen.getByText(
        "A text variable in this card can only be connected to a text filter with Is operator.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Learn how")).toBeInTheDocument();
  });

  it("should not show a parameter help link when `show-metabase-links: false`", () => {
    setup({ showMetabaseLinks: false });

    expect(
      screen.getByText(
        "A text variable in this card can only be connected to a text filter with Is operator.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Learn how")).not.toBeInTheDocument();
  });

  it("should show a model help link when `show-metabase-links: true`", () => {
    setup({ cardType: "model", showMetabaseLinks: true });

    expect(screen.getByText(/Models are data sources/)).toBeInTheDocument();
    expect(screen.getByText("Learn more")).toBeInTheDocument();
  });

  it("should not show a model help link when `show-metabase-links: false`", () => {
    setup({ cardType: "model", showMetabaseLinks: false });

    expect(screen.getByText(/Models are data sources/)).toBeInTheDocument();
    expect(screen.queryByText("Learn more")).not.toBeInTheDocument();
  });
});
