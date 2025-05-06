import { setupEnterprisePlugins } from "__support__/enterprise";
import { screen } from "__support__/ui";
import type { EnterpriseSettings } from "metabase-types/api";

import {
  setup as OSSSetup,
  testApiKeys,
} from "./AuthenticationSettingsPage.setup";

const setup = async (
  extraSettings?: Partial<EnterpriseSettings>,
  tab = "authentication",
) => {
  setupEnterprisePlugins();
  return OSSSetup(extraSettings, true, tab);
};

describe("AuthenticationSettingsPage (EE)", () => {
  it("should render the page with tabs", async () => {
    await setup();
    expect(await screen.findByText("Authentication")).toBeInTheDocument();
    expect(await screen.findByText("User Provisioning")).toBeInTheDocument();
    expect(await screen.findByText("API Keys")).toBeInTheDocument();
  });

  it("Authentication tab should contain enterprise auth options", async () => {
    await setup({
      "google-auth-enabled": true, // this has to be enabled to see the password auth option
    });

    expect(await screen.findByText("SAML")).toBeInTheDocument();
    expect(await screen.findByText("JWT")).toBeInTheDocument();
    expect(
      await screen.findByText("Enable password authentication"),
    ).toBeInTheDocument();
    expect(await screen.findByText("Session timeout")).toBeInTheDocument();
  });

  it("Authentication tab should also include OSS auth providers", async () => {
    await setup();

    expect(await screen.findByText("Sign in with Google")).toBeInTheDocument();
    expect(await screen.findByText("LDAP")).toBeInTheDocument();
  });

  // note: can't get user provisioning plugin to render due to enterprise plugin shenanigans

  it("should render the API keys tab", async () => {
    await setup({}, "api-keys");
    await screen.findByText("Manage API Keys");
    await screen.findByText("Create API Key");

    testApiKeys.forEach((apiKey) => {
      expect(screen.getByText(apiKey.name)).toBeInTheDocument();
    });
  });
});
