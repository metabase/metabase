import userEvent from "@testing-library/user-event";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  findRequests,
  setupUpdateSettingsEndpoint,
} from "__support__/server-mocks";
import { screen, waitFor, within } from "__support__/ui";
import type { AuthSettingsPageTab } from "metabase/plugins";
import type { EnterpriseSettings } from "metabase-types/api";

import { setup as OSSSetup } from "./AuthenticationSettingsPage.setup";

const setup = async (
  extraSettings?: Partial<EnterpriseSettings>,
  tab: AuthSettingsPageTab = "authentication",
) => {
  setupEnterpriseOnlyPlugin("auth");
  return OSSSetup(extraSettings, true, tab);
};

const deactivate = async (cardTestId: string) => {
  const card = await screen.findByTestId(cardTestId);
  await userEvent.click(within(card).getByRole("button", { name: "Actions" }));
  await userEvent.click(
    await screen.findByRole("menuitem", { name: "Deactivate" }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Deactivate" }),
  );
  await waitFor(async () => {
    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
  });
  const [{ body }] = await findRequests("PUT");
  return body;
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

  it("clears the tenant assignment attribute when SAML is deactivated", async () => {
    setupUpdateSettingsEndpoint();
    await setup({ "saml-configured": true, "saml-enabled": true });

    const body = await deactivate("saml-setting");

    expect(body).toHaveProperty("saml-identity-provider-uri", null);
    expect(body).toHaveProperty("saml-attribute-tenant", null);
  });

  it("clears the tenant assignment attribute when JWT is deactivated", async () => {
    setupUpdateSettingsEndpoint();
    await setup({ "jwt-configured": true, "jwt-enabled": true });

    const body = await deactivate("jwt-setting");

    expect(body).toHaveProperty("jwt-identity-provider-uri", null);
    expect(body).toHaveProperty("jwt-attribute-tenant", null);
  });

  it("should also include OSS auth providers", async () => {
    await setup();

    expect(await screen.findByText("Sign in with Google")).toBeInTheDocument();
    expect(await screen.findByText("LDAP")).toBeInTheDocument();
  });
});
