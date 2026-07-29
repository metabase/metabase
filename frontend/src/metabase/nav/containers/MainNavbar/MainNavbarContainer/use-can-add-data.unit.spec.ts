import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupDatabaseListEndpoint,
  setupTokenStatusEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import {
  createMockDatabase,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { useCanAddData } from "./use-can-add-data";

function setup({
  isSuperUser = false,
  canUpload = false,
  canAccessSettings = false,
}: {
  isSuperUser?: boolean;
  canUpload?: boolean;
  canAccessSettings?: boolean;
}) {
  const database = createMockDatabase({
    uploads_enabled: canUpload,
    can_upload: canUpload,
  });
  const currentUser = createMockUser({ is_superuser: isSuperUser });

  if (canAccessSettings) {
    currentUser.permissions = {
      can_access_setting: true,
      can_access_monitoring: false,
      can_access_subscription: false,
    };
    // enterprise plugin is needed for advanced permissions to be returned
    setupEnterprisePlugins();
  }

  setupTokenStatusEndpoint({ valid: true });

  const storeInitialState = createMockState({
    currentUser,
    entities: createMockEntitiesState({
      databases: [database],
      collections: [],
    }),
    settings: mockSettings({
      "token-features": createMockTokenFeatures({ advanced_permissions: true }),
    }),
  });

  setupDatabaseListEndpoint([database]);

  return renderHookWithProviders(() => useCanAddData(), { storeInitialState });
}

describe("useCanAddData", () => {
  const testCases = [
    { description: "an admin", data: { isSuperUser: true } },
    { description: "a user who can upload", data: { canUpload: true } },
    {
      description: "a user with settings access",
      data: { canAccessSettings: true },
    },
  ];

  it.each(testCases)("offers Add data to $description", async (testCase) => {
    const { result } = setup(testCase.data);

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it("does not offer Add data to a user who can neither upload nor manage settings", async () => {
    const { result } = setup({});

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });
});
