import { screen } from "__support__/ui";
import { setup } from "./setup.spec";

const setupEnterprise = initialRoute => {
  setup({
    initialRoute,
    hasEnterprisePlugins: true,
  });
};
describe("SettingsEditorApp", () => {
  it("should not show JWT and SAML auth options", () => {
    setupEnterprise("/admin/settings/authentication");

    expect(screen.queryByText("SAML")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Allows users to login via a SAML Identity Provider."),
    ).not.toBeInTheDocument();

    expect(screen.queryByText("JWT")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Allows users to login via a JWT Identity Provider."),
    ).not.toBeInTheDocument();
  });

  it("should not let users access JWT settings", () => {
    setupEnterprise("/admin/settings/authentication/jwt");
    expect(screen.getByText("We're a little lost...")).toBeInTheDocument();
  });

  it("should not let users access SAML settings", () => {
    setupEnterprise("/admin/settings/authentication/saml");
    expect(screen.getByText("We're a little lost...")).toBeInTheDocument();
  });
});
