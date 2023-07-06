import { screen } from "__support__/ui";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { setup } from "./setup";

const setupPremium = initialRoute => {
  setup({
    initialRoute,
    tokenFeatures: createMockTokenFeatures({ sso: true }),
    hasEnterprisePlugins: true,
  });
};
describe("SettingsEditorApp", () => {
  it("shows JWT and SAML auth options", () => {
    setupPremium("/admin/settings/authentication");

    expect(screen.getByText("SAML")).toBeInTheDocument();
    expect(
      screen.getByText("Allows users to login via a SAML Identity Provider."),
    ).toBeInTheDocument();

    expect(screen.getByText("JWT")).toBeInTheDocument();
    expect(
      screen.getByText("Allows users to login via a JWT Identity Provider."),
    ).toBeInTheDocument();
  });

  it("lets users access JWT settings", () => {
    setupPremium("/admin/settings/authentication/jwt");

    expect(screen.getByText("Server Settings")).toBeInTheDocument();
    expect(screen.getByText("JWT Identity Provider URI")).toBeInTheDocument();
  });

  it("lets users access SAML settings", () => {
    setupPremium("/admin/settings/authentication/saml");

    expect(screen.getByText("Set up SAML-based SSO")).toBeInTheDocument();
    expect(
      screen.getByText("Configure your identity provider (IdP)"),
    ).toBeInTheDocument();
  });
});
