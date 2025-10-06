import { screen, within } from "__support__/ui";

import { type SetupOpts, setup as baseSetup } from "./setup";

const setup = (opts: SetupOpts = {}) =>
  baseSetup({
    hasEnterprisePlugins: true,
    tokenFeatures: { embedding_sdk: opts.isEmbeddingSdkEnabled },
    ...opts,
  });

describe("EmbeddingSdkSettings (EE)", () => {
  it("should not tell users to switch binaries when they have a EE build", async () => {
    await setup({
      isEmbeddingSdkEnabled: false,
      showSdkEmbedTerms: false,
      isHosted: true,
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
});
