import { screen } from "__support__/ui";
import { setup, SetupOpts } from "./setup";

const setupEnterprise = (opts?: SetupOpts) => {
  setup({
    ...opts,
    hasEnterprisePlugins: true,
  });
};

describe("CreateCollectionForm", () => {
  it("does not show authority level controls when the token has no features", () => {
    setupEnterprise();
    expect(screen.queryByText("Collection type")).not.toBeInTheDocument();
  });
});
