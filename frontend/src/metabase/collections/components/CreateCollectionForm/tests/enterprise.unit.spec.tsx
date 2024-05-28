import { screen } from "__support__/ui";

import type { SetupOpts } from "./setup";
import { setup } from "./setup";

const setupEnterprise = (opts?: SetupOpts) => {
  setup({
    ...opts,
    hasEnterprisePlugins: true,
  });
};

describe("CreateCollectionForm", () => {
  it("does not show authority level controls", () => {
    setupEnterprise();
    expect(screen.queryByText("Collection type")).not.toBeInTheDocument();
  });
});
