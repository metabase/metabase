import { screen } from "__support__/ui";

import type { SetupOpts } from "./setup";
import { setup as baseSetup } from "./setup";

function setup(opts: SetupOpts) {
  baseSetup({
    hasEnterprisePlugins: true,
    ...opts,
  });
}

describe("TagEditorHelp (EE without token)", () => {
  it("should show a help link when `show-metabase-links: true`", () => {
    setup({ showMetabaseLinks: true });

    expect(screen.getByText("Read the full documentation")).toBeInTheDocument();
  });

  it("should show a help link when `show-metabase-links: false`", () => {
    setup({ showMetabaseLinks: false });

    expect(screen.getByText("Read the full documentation")).toBeInTheDocument();
  });
});
