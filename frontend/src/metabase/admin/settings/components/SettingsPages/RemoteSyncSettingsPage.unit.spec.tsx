import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import type { TokenFeatures } from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { RemoteSyncSettingsPage } from "./RemoteSyncSettingsPage";

describe("RemoteSyncSettingsPage", () => {
  it.each<{ description: string; tokenFeatures: Partial<TokenFeatures> }>([
    { description: "no other features", tokenFeatures: {} },
    {
      description: "other paid features",
      tokenFeatures: { hosting: true, advanced_permissions: true },
    },
  ])(
    "should show the remote sync upsell when the remote sync feature is off, with $description",
    ({ tokenFeatures }) => {
      const settings = createMockSettings({
        "token-features": createMockTokenFeatures(tokenFeatures),
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
    },
  );
});
