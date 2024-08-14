import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("TagEditorHelp (OSS)", () => {
  it("should show a help link when `show-metabase-links: true`", () => {
    setup({ showMetabaseLinks: true });

    expect(screen.getByText("Read the full documentation")).toBeInTheDocument();
  });

  it("should show a help link when `show-metabase-links: false`", () => {
    setup({ showMetabaseLinks: false });

    expect(screen.getByText("Read the full documentation")).toBeInTheDocument();
  });
});
