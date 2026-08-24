import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("EmbeddingSdkSettings (OSS)", () => {
  describe("SDK card", () => {
    it("should not show SDK card in OSS", async () => {
      await setup({
        isEmbeddingEnabled: false,
        showModularEmbedTerms: false,
      });
      expect(
        screen.queryByText(/Enable modular embedding SDK/i),
      ).not.toBeInTheDocument();
    });
  });

  it("should show cards with related settings", async () => {
    await setup({
      isEmbeddingEnabled: false,
      showModularEmbedTerms: false,
    });

    const relatedSettingCards = await screen.findAllByTestId(
      "related-setting-card",
    );
    expect(relatedSettingCards).toHaveLength(4);

    expect(await screen.findByText("Authentication")).toBeInTheDocument();
    expect(await screen.findByText("Databases")).toBeInTheDocument();
    expect(await screen.findByText("People")).toBeInTheDocument();
    expect(await screen.findByText("Permissions")).toBeInTheDocument();
  });

  it("does not show the modular embedding toggle when token features are missing", () => {
    setup({
      tokenFeatures: { embedding_simple: false },
    });

    expect(
      screen.queryByText("Enable modular embedding"),
    ).not.toBeInTheDocument();
  });

  it("shows the Guest Embeds toggle when token features are missing", () => {
    setup({ tokenFeatures: { embedding_simple: false } });

    expect(screen.getByText("Enable guest embeds")).toBeInTheDocument();
  });
});
