import "metabase/plugins/builtin";
import { setupGroupsEndpoint } from "__support__/server-mocks";
import { screen } from "__support__/ui";
import {
  createMockGroup,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import type { SetupOpts } from "./setup";
import { setup } from "./setup";

const setupPremium = (opts?: SetupOpts) => {
  setupGroupsEndpoint([createMockGroup()]);
  setup({
    ...opts,
    tokenFeatures: createMockTokenFeatures({
      sso_google: true,
    }),
    hasEnterprisePlugins: true,
  });
};

describe("SettingsEditorApp", () => {
  it("suggests adding multiple domains", async () => {
    setupPremium({
      initialRoute: "/admin/settings/authentication/google",
    });

    expect(await screen.findByText("Sign in with Google")).toBeInTheDocument();
    expect(
      await screen.findByText(
        "Allow users to sign up on their own if their Google account email address is from one of the domains you specify here:",
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByPlaceholderText(
        "mycompany.com, example.com.br, otherdomain.co.uk",
      ),
    ).toBeInTheDocument();
  });
});
