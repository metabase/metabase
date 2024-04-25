import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("FormCerator > Description (OSS)", () => {
  it("should show a help link when `show-metabase-links: true`", () => {
    setup({ showMetabaseLinks: true });

    expect(
      screen.getByText(
        "Configure your parameters' types and properties here. The values for these parameters can come from user input, or from a dashboard filter.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Learn more")).toBeInTheDocument();
  });

  it("should show a help link when `show-metabase-links: false`", () => {
    setup({ showMetabaseLinks: false });

    expect(
      screen.getByText(
        "Configure your parameters' types and properties here. The values for these parameters can come from user input, or from a dashboard filter.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Learn more")).toBeInTheDocument();
  });
});
