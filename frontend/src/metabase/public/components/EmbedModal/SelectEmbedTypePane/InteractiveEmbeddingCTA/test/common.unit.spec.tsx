import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("InteractiveEmbeddingCTA", () => {
  it("should display a CTA to the product page when plan is OSS", () => {
    setup();

    expect(screen.getByText("Interactive Embedding")).toBeInTheDocument();
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Give your customers the full power of Metabase in your own app, with SSO, advanced permissions, customization, and more.",
      ),
    ).toBeInTheDocument();

    expect(screen.getByTestId("interactive-embedding-cta")).toHaveAttribute(
      "href",
      "https://www.metabase.com/product/embedded-analytics?utm_source=oss&utm_media=static-embed-popover",
    );
  });
});
