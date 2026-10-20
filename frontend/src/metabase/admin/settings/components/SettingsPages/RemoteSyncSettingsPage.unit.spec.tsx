import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { RemoteSyncSettingsPage } from "./RemoteSyncSettingsPage";

describe("RemoteSyncSettingsPage", () => {
  it("should show the remote sync upsell when remote sync is not enabled", () => {
    const settings = createMockSettings({
      "token-features": createMockTokenFeatures({}),
    });

    renderWithProviders(<RemoteSyncSettingsPage />, {
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: true }),
        settings: mockSettings(settings),
      }),
    });

    expect(
      screen.getByText(/Manage your Metabase content in Git/i),
    ).toBeInTheDocument();
  });
});
