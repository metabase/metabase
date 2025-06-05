import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("SettingsEditorApp", () => {
  // this has to be tested in its own file because we can't change token features within a single test file
  it("should not let users access SAML settings without saml feature", async () => {
    await setup({
      initialRoute: "/admin/settings/authentication/saml",
      hasEnterprisePlugins: true,
    });
    expect(
      await screen.findByText("We're a little lost..."),
    ).toBeInTheDocument();
  });
});
