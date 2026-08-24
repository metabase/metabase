import { screen, within } from "__support__/ui";

import { type SetupOpts, setup as baseSetup } from "./setup";

const setup = (opts: SetupOpts = {}) => baseSetup(opts);

describe("EmbeddingSdkSettings (EE with Embedding SDK token)", () => {
  it("should not tell users to upgrade or switch binaries", async () => {
    await setup({
      tokenFeatures: { embedding_sdk: true, embedding_simple: true },
      isEmbeddingEnabled: true,
      showModularEmbedTerms: false,
      enterprisePlugins: [
        "embedding-sdk",
        "embedding_iframe_sdk",
        "embedding_iframe_sdk_setup",
      ],
    });
    expect(
      screen.getByText(
        /You can test Embedded analytics SDK on localhost quickly by using API keys/i,
      ),
    ).toBeInTheDocument();

    const alertInfo = within(screen.getByTestId("sdk-settings-alert-info"));
    // should only be shown on non-EE instances
    expect(
      alertInfo.queryByText("switch Metabase binaries"),
    ).not.toBeInTheDocument();
    expect(
      alertInfo.queryByText("upgrade to Metabase Pro"),
    ).not.toBeInTheDocument();
    expect(
      alertInfo.getByText("implement JWT or SAML SSO"),
    ).toBeInTheDocument();
  });

  it("should show Security and Appearance in related settings", async () => {
    await setup({
      tokenFeatures: { embedding_sdk: true, embedding_simple: true },
      isEmbeddingEnabled: true,
      showModularEmbedTerms: false,
    });

    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.getByText("Appearance")).toBeInTheDocument();
  });
});
