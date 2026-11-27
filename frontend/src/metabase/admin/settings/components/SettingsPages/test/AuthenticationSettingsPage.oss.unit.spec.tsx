import { screen } from "__support__/ui";

import {
  type AuthCardCase,
  pauseResumeAndDeactivate,
  setup,
  setupStatefulAuthCards,
} from "./AuthenticationSettingsPage.setup";

const GOOGLE_CARD: AuthCardCase = {
  name: "Google",
  cardTestId: "google-setting",
  enabledKey: "google-auth-enabled",
  configuredKey: "google-auth-configured",
  requiredKey: "google-auth-client-id",
};

const LDAP_CARD: AuthCardCase = {
  name: "LDAP",
  cardTestId: "ldap-setting",
  enabledKey: "ldap-enabled",
  configuredKey: "ldap-configured?",
  requiredKey: "ldap-host",
};

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

  it.each([
    { card: GOOGLE_CARD, otherCard: LDAP_CARD },
    { card: LDAP_CARD, otherCard: GOOGLE_CARD },
  ])(
    "pauses, resumes and deactivates $card.name and leaves $otherCard.name alone",
    async ({ card, otherCard }) => {
      const { settings } = await setup({
        "google-auth-enabled": true,
        "google-auth-configured": true,
        "google-auth-client-id": "example.apps.googleusercontent.com",
        "ldap-enabled": true,
        "ldap-configured?": true,
        "ldap-host": "ldap.example.test",
      });
      setupStatefulAuthCards(settings, [GOOGLE_CARD, LDAP_CARD]);

      const deactivation = await pauseResumeAndDeactivate(card, otherCard);

      expect(deactivation).toMatchObject({
        [card.enabledKey]: false,
        [card.requiredKey]: null,
      });
    },
  );
});
