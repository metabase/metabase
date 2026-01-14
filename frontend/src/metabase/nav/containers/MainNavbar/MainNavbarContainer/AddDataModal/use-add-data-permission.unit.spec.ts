import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupDatabaseListEndpoint,
  setupTokenStatusEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import {
  createMockDatabase,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { useAddDataPermissions } from "./use-add-data-permission";

function setup({
  isSuperUser = false,
  canUpload = false,
  canAccessSettings = false,
}) {
  const database = createMockDatabase({
    uploads_enabled: canUpload,
    can_upload: canUpload,
  });
  const currentUser = createMockUser({
    is_superuser: isSuperUser,
  });

  if (canAccessSettings) {
    currentUser.permissions = {
      can_access_setting: true,
      can_access_monitoring: false,
      can_access_subscription: false,
    };
  }
  setupTokenStatusEndpoint({ valid: true });

  if (canAccessSettings) {
    // enterprise plugin is needed for advanced permissions to be returned
    setupEnterprisePlugins();
  }

  const storeInitialState = createMockState({
    currentUser,
    entities: createMockEntitiesState({
      databases: [database],
      collections: [],
    }),
    settings: mockSettings({
      "token-features": createMockTokenFeatures({
        advanced_permissions: true,
      }),
      "uploads-settings": {
        db_id: database.id,
        schema_name: "uploads",
        table_prefix: "uploaded_",
      },
    }),
  });

  setupDatabaseListEndpoint([database]);

  return renderHookWithProviders(() => useAddDataPermissions(), {
    storeInitialState,
  });
}

describe("correctly sets canPerformMeaningfulActions", () => {
  const testCases = [
    {
      description: "admin user can perform meaningful actions",
      data: { isSuperUser: true },
    },
    {
      description: "user who can upload can perform meaningful actions",
      data: { canUpload: true },
    },
    {
      description: "user with settings access can perform meaningful actions",
      data: { canAccessSettings: true },
    },
  ];

  it.each(testCases)("$description", async (testCase) => {
    const { result } = setup(testCase.data);

    await waitFor(() => {
      expect(result.current).toEqual(
        expect.objectContaining({ canPerformMeaningfulActions: true }),
      );
    });
  });
});
