import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { screen } from "__support__/ui";
import type { EnterpriseSettings } from "metabase-types/api";

import { setup as OSSSetup } from "./AuthenticationSettingsPage.setup";

const setup = async (
  extraSettings?: Partial<EnterpriseSettings>,
  tab = "authentication",
) => {
  setupEnterpriseOnlyPlugin("auth");
  return OSSSetup(extraSettings, true, tab);
};

describe("AuthenticationSettingsPage (EE)", () => {
  it("should contain enterprise auth options", async () => {
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

  it("should also include OSS auth providers", async () => {
    await setup();

    expect(await screen.findByText("Sign in with Google")).toBeInTheDocument();
    expect(await screen.findByText("LDAP")).toBeInTheDocument();
  });
});
