import { screen } from "__support__/ui";

import type { SetupOpts } from "./setup";
import { setup } from "./setup";

const setupPremium = (opts?: SetupOpts) => {
  setup({
    ...opts,
    hasEnterprisePlugins: true,
    tokenFeatures: {
      embedding: true,
    },
  });
};

describe("EmbedHomepage (EE, with features)", () => {
  it("should default to the interactive tab for EE builds", () => {
    setupPremium();
    expect(
      screen.getByText("Use interactive embedding", { exact: false }),
    ).toBeInTheDocument();

    // making sure Tabs isn't just rendering both tabs, making the test always pass
    expect(
      screen.queryByText("Use static embedding", { exact: false }),
    ).not.toBeInTheDocument();
  });

  it("should prompt to activate the license if it wasn't found at the end of the setup", () => {
    setupPremium();

    expect(
      screen.getByText("Activate your commercial license"),
    ).toBeInTheDocument();
  });

  it("should not prompt to activate the license if a license was found at the end of the setup", () => {
    setupPremium({
      settings: { "setup-license-active-at-setup": true },
    });

    expect(
      screen.queryByText("Activate your commercial license"),
    ).not.toBeInTheDocument();
  });
});
