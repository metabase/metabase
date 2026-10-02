import { renderWithProviders, screen } from "__support__/ui";

import { EnableEmbeddingPrompt } from "./EnableEmbeddingPrompt";

const setup = ({
  isEnabled,
  isTermsAccepted,
}: {
  isEnabled: boolean;
  isTermsAccepted: boolean;
}) => {
  renderWithProviders(
    <EnableEmbeddingPrompt
      isEnabled={isEnabled}
      isTermsAccepted={isTermsAccepted}
    />,
  );
};

describe("EnableEmbeddingPrompt", () => {
  it("prompts to enable modular embedding when it is disabled", () => {
    setup({ isEnabled: false, isTermsAccepted: false });

    expect(
      screen.getByText(
        "Enable modular embedding to see a live preview of your theme.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Enable modular embedding" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "usage conditions" }),
    ).not.toBeInTheDocument();
  });

  it("links to the usage conditions when only the terms are pending", () => {
    setup({ isEnabled: true, isTermsAccepted: false });

    expect(
      screen.getByText(/to see a live preview of your theme\./),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Accept and continue" }),
    ).toBeInTheDocument();

    const link = screen.getByRole("link", { name: "usage conditions" });
    expect(link).toHaveAttribute(
      "href",
      "https://metabase.com/license/embedding",
    );
    expect(link).toHaveAttribute("target", "_blank");
  });
});
