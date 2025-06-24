import { screen } from "__support__/ui";

import { setup } from "./AuthenticationSettingsPage.setup";

describe("AuthenticationSettingsPage (OSS)", () => {
  it("should render oss auth providers", async () => {
    await setup();

    expect(await screen.findByText("Sign in with Google")).toBeInTheDocument();
    expect(await screen.findByText("LDAP")).toBeInTheDocument();
    expect(await screen.findByText("API Keys")).toBeInTheDocument();
  });

  it("should not render EE auth providers", async () => {
    await setup();
    expect(await screen.findByText("Sign in with Google")).toBeInTheDocument();

    expect(screen.queryByText(/saml/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/jwt/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/scim/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/User Provisioning/i)).not.toBeInTheDocument();
  });

  it("should render active badges for enabled and configured auth providers", async () => {
    await setup({
      "google-auth-enabled": true,
      "ldap-enabled": true,
      "ldap-configured?": true,
      "google-auth-configured": true,
    });

    expect(await screen.findAllByText("Active")).toHaveLength(2);
  });

  it("should show paused badges for configured but not enabled auth providers", async () => {
    await setup({
      "google-auth-enabled": false,
      "ldap-enabled": false,
      "ldap-configured?": true,
      "google-auth-configured": true,
    });

    expect(await screen.findAllByText("Paused")).toHaveLength(2);
  });
});
