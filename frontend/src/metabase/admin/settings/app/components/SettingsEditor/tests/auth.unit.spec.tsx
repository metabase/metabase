import { setupGroupsEndpoint } from "__support__/server-mocks";
import { screen } from "__support__/ui";
import {
  createMockGroup,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import type { SetupOpts } from "./setup";
import { setup } from "./setup";

const setupPremium = async (feature: string, opts?: SetupOpts) => {
  setupGroupsEndpoint([createMockGroup()]);
  await setup({
    ...opts,
    tokenFeatures: createMockTokenFeatures({
      [feature]: true,
      sso_google: true,
    }),
    hasEnterprisePlugins: true,
  });
};

describe("SettingsEditorApp", () => {
  it("shows session timeout option", async () => {
    await setupPremium("session_timeout_config", {
      initialRoute: "/admin/settings/authentication",
    });
    expect(await screen.findByText("Session timeout")).toBeInTheDocument();
  });
});
