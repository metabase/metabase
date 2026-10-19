import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { setupSettingEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, within } from "__support__/ui";
import { Route } from "metabase/router";
import {
  createMockTokenFeatures,
  createMockUser,
  createMockVersionInfo,
} from "metabase-types/api/mocks";

import { SettingsNav } from "./SettingsNav";

const setup = () => {
  const versionInfo = createMockVersionInfo();
  const settings = mockSettings({
    "version-info": versionInfo,
    "token-features": createMockTokenFeatures({ remote_sync: true }),
  });

  setupSettingEndpoint({
    settingKey: "version-info",
    settingValue: versionInfo,
  });
  setupEnterpriseOnlyPlugin("remote_sync");

  renderWithProviders(<Route path="*" element={<SettingsNav />} />, {
    withRouter: true,
    initialRoute: "/admin/settings/general",
    storeInitialState: createMockState({
      currentUser: createMockUser({ is_superuser: true }),
      settings,
    }),
  });
};

describe("SettingsNav (EE)", () => {
  it("should show the Remote sync nav item without an upsell gem when remote sync is enabled", async () => {
    setup();

    const remoteSyncNavItem = await screen.findByRole("link", {
      name: /Remote sync/,
    });
    expect(
      within(remoteSyncNavItem).queryByTestId("upsell-gem"),
    ).not.toBeInTheDocument();
  });
});
