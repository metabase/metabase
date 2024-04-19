import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("DashCardParameterMapper > DisabledNativeCardHelpText (OSS)", () => {
  it("should show a help link when `show-metabase-links: true`", () => {
    setup({ showMetabaseLinks: true });

    expect(
      screen.getByText(
        "A text variable in this card can only be connected to a text filter with Is operator.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Learn how")).toBeInTheDocument();
  });

  it("should show a help link when `show-metabase-links: false`", () => {
    setup({ showMetabaseLinks: false });

    expect(
      screen.getByText(
        "A text variable in this card can only be connected to a text filter with Is operator.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Learn how")).toBeInTheDocument();
  });
});
