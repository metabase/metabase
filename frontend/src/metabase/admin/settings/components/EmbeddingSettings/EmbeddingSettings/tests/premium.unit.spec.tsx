import { screen, within } from "__support__/ui";

import { type SetupOpts, setup as baseSetup } from "./setup";

const setup = (opts: SetupOpts = {}) =>
  baseSetup({
    tokenFeatures: {
      embedding_simple: opts.isEmbeddingSimpleEnabled,
      embedding_sdk: opts.isEmbeddingSdkEnabled,
    },
    ...opts,
  });

describe("EmbeddingSdkSettings (EE with Embedding SDK token)", () => {
  it("should not tell users to upgrade or switch binaries", async () => {
    await setup({
      isEmbeddingSdkEnabled: true,
      isEmbeddingSimpleEnabled: true,
      showSdkEmbedTerms: false,
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

  describe("Version pinning", () => {
    it("should offer users version pinning when they have a cloud instance", async () => {
      await setup({
        isEmbeddingSdkEnabled: true,
        isEmbeddingSimpleEnabled: true,
        showSdkEmbedTerms: false,
        isHosted: true,
        enterprisePlugins: [
          "embedding-sdk",
          "embedding_iframe_sdk",
          "embedding_iframe_sdk_setup",
        ],
      });

      expect(screen.getByText("Version pinning")).toBeInTheDocument();
      expect(
        screen.getByText(
          /Metabase Cloud instances are automatically upgraded to new releases/i,
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Request version pinning" }),
      ).toBeInTheDocument();
    });

    it("should not offer users version pinning on self hosted instances", () => {
      setup({ isHosted: false });

      expect(screen.queryByText("Version pinning")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "Request version pinning" }),
      ).not.toBeInTheDocument();
    });
  });
});
