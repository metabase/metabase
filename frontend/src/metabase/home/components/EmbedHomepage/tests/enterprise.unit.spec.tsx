import { screen } from "__support__/ui";

import type { SetupOpts } from "./setup";
import { setup } from "./setup";

const setupEnterprise = (opts?: SetupOpts) => {
  setup({
    ...opts,
    hasEnterprisePlugins: true,
  });
};

describe("EmbedHomepage (EE, no token)", () => {
  it("should default to the interactive tab for EE builds", () => {
    setupEnterprise();
    expect(
      screen.getByText("Use interactive embedding", { exact: false }),
    ).toBeInTheDocument();

    // making sure Tabs isn't just rendering both tabs, making the test always pass
    expect(
      screen.queryByText("Use static embedding", { exact: false }),
    ).not.toBeInTheDocument();
  });

  it("should prompt to activate the license if it wasn't found at the end of the setup", () => {
    setupEnterprise();

    expect(
      screen.getByText("Activate your commercial license"),
    ).toBeInTheDocument();
  });
});
