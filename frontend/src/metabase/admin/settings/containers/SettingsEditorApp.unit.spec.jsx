import { screen } from "__support__/ui";

import { setup } from "./setup.spec";

describe("SettingsEditorApp", () => {
  it("should not show JWT and SAML auth options", () => {
    setup({ initialRoute: "/admin/settings/authentication" });

    expect(screen.queryByText("SAML")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Allows users to login via a SAML Identity Provider."),
    ).not.toBeInTheDocument();

    expect(screen.queryByText("JWT")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Allows users to login via a JWT Identity Provider."),
    ).not.toBeInTheDocument();
  });

  it("lets users view sign in with Google settings page", () => {
    setup({ initialRoute: "/admin/settings/authentication/google" });
    expect(screen.getByText("Sign in with Google")).toBeInTheDocument();
  });

  it("should not let users access JWT settings", () => {
    setup({ initialRoute: "/admin/settings/authentication/jwt" });
    expect(screen.getByText("We're a little lost...")).toBeInTheDocument();
  });

  it("should not let users access SAML settings", () => {
    setup({ initialRoute: "/admin/settings/authentication/saml" });
    expect(screen.getByText("We're a little lost...")).toBeInTheDocument();
  });
});
