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
      session_timeout_config: true,
    }),
    hasEnterprisePlugins: true,
  });
};

describe("SettingsEditorApp", () => {
  it("shows session timeout option", async () => {
    setupPremium({
      initialRoute: "/admin/settings/authentication",
    });

    expect(await screen.findByText("Session timeout")).toBeInTheDocument();
  });
});
