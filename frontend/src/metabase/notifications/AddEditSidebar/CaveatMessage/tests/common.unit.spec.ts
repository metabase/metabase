import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("CaveatMessage (OSS)", () => {
  it("should show a help link when `show-metabase-links: true`", () => {
    setup({ showMetabaseLinks: true });

    expect(
      screen.getByText(
        "Recipients will see this data just as you see it, regardless of their permissions.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Learn more.")).toBeInTheDocument();
  });

  it("should show a help link when `show-metabase-links: false`", () => {
    setup({ showMetabaseLinks: false });

    expect(
      screen.getByText(
        "Recipients will see this data just as you see it, regardless of their permissions.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Learn more.")).toBeInTheDocument();
  });
});
