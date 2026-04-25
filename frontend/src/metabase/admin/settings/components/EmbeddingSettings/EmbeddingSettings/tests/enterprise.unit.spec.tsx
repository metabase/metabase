import { screen, within } from "__support__/ui";

import { type SetupOpts, setup as baseSetup } from "./setup";

const setup = (opts: SetupOpts = {}) =>
  baseSetup({
    tokenFeatures: {
      embedding_sdk: opts.isEmbeddingSdkEnabled,
      embedding_simple: opts.isEmbeddingSimpleEnabled,
    },
    ...opts,
  });

describe("EmbeddingSdkSettings (EE)", () => {
  it("should not tell users to switch binaries when they have a EE build", async () => {
    await setup({
      isEmbeddingSdkEnabled: false,
      isEmbeddingSimpleEnabled: true,
      showSdkEmbedTerms: false,
      isHosted: true,
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
    expect(
      alertInfo.queryByText("switch Metabase binaries"),
    ).not.toBeInTheDocument();
    expect(alertInfo.getByText("upgrade to Metabase Pro")).toBeInTheDocument();
    expect(
      alertInfo.getByText("implement JWT or SAML SSO"),
    ).toBeInTheDocument();
  });

  it("should show Tenants in related settings when tenants feature is available", async () => {
    await setup({
      tokenFeatures: { tenants: true },
      enterprisePlugins: [
        "embedding-sdk",
        "embedding_iframe_sdk",
        "embedding_iframe_sdk_setup",
        "tenants",
      ],
    });

    expect(screen.getByText("Tenants")).toBeInTheDocument();
  });

  it("should not show Security and Appearance in related settings without token", async () => {
    await setup({
      isEmbeddingSdkEnabled: false,
      isEmbeddingSimpleEnabled: false,
      showSdkEmbedTerms: false,
    });

    expect(screen.queryByText("Security")).not.toBeInTheDocument();
    expect(screen.queryByText("Appearance")).not.toBeInTheDocument();
  });
});
