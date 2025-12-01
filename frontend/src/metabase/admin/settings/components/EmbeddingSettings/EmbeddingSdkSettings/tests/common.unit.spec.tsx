import { screen, within } from "__support__/ui";

import { setup } from "./setup";

describe("EmbeddingSdkSettings (OSS)", () => {
  it("should not show SDK card in OSS", async () => {
    await setup({
      isEmbeddingSdkEnabled: false,
      showSdkEmbedTerms: false,
    });
    expect(screen.queryByText("SDK for React")).not.toBeInTheDocument();
  });

  it("should not show version pinning section", async () => {
    await setup({
      isEmbeddingSdkEnabled: true,
      showSdkEmbedTerms: false,
    });
    expect(screen.queryByText("Version pinning")).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Metabase Cloud instances are automatically upgraded to new releases. SDK packages are strictly compatible with specific version of Metabase. You can request to pin your Metabase to a major version and upgrade your Metabase and SDK dependency in a coordinated fashion.",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Request version pinning" }),
    ).not.toBeInTheDocument();
  });

  it("should show cards with related settings", async () => {
    await setup({
      isEmbeddingSdkEnabled: true,
      showSdkEmbedTerms: false,
    });

    const relatedSettingCards = await screen.findAllByTestId(
      "related-setting-card",
    );
    expect(relatedSettingCards).toHaveLength(5);

    expect(await screen.findByText("Authentication")).toBeInTheDocument();
    expect(await screen.findByText("Databases")).toBeInTheDocument();
    expect(await screen.findByText("People")).toBeInTheDocument();
    expect(await screen.findByText("Permissions")).toBeInTheDocument();
    expect(await screen.findByText("Appearance")).toBeInTheDocument();
  });

  it("shows the Embedded Analytics JS toggle is Disabled when token features are missing (EMB-801)", () => {
    setup({ tokenFeatures: { embedding_simple: false } });

    const toggle = screen.getByRole("switch", {
      name: "Embedded Analytics JS toggle",
    });

    expect(toggle).toBeDisabled();

    const toggleContainer = screen
      .getAllByTestId("switch-with-env-var")
      .find((toggleElement) =>
        within(toggleElement).queryByRole("switch", {
          name: "Embedded Analytics JS toggle",
        }),
      );

    expect(within(toggleContainer!).getByText("Disabled")).toBeInTheDocument();
  });

  it("should not show embed button and docs when Embedded Analytics JS is not available", async () => {
    setup({ tokenFeatures: { embedding_simple: false } });

    const card = screen
      .getAllByTestId("sdk-setting-card")
      .find((card) => card.textContent?.includes("Embedded Analytics JS"));

    // Upsell and documentation should be shown
    expect(card).toHaveTextContent("Try for free");
    expect(card).toHaveTextContent("Documentation");

    // Call-to-action should not be shown
    expect(card).not.toHaveTextContent("New embed");
  });

  it("should not show embed button on oss even if simple embedding is enabled", async () => {
    await setup({
      isEmbeddingSimpleEnabled: true,
      tokenFeatures: { embedding_simple: false },
    });

    const card = screen
      .getAllByTestId("sdk-setting-card")
      .find((card) => card.textContent?.includes("Embedded Analytics JS"));

    expect(card).not.toHaveTextContent("New embed");
    expect(card).toHaveTextContent("Documentation");
  });
});
