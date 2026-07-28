import { setupDatabaseListEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { createMockDatabase, createMockUser } from "metabase-types/api/mocks";

import { useAddDataState } from "./use-add-data-state";

function setup({
  canUpload = false,
  uploadsEnabled = canUpload,
  staleUploadsSettingDbId = null,
}: {
  canUpload?: boolean;
  uploadsEnabled?: boolean;
  staleUploadsSettingDbId?: number | null;
}) {
  const database = createMockDatabase({
    uploads_enabled: uploadsEnabled,
    can_upload: canUpload,
  });

  const storeInitialState = createMockState({
    currentUser: createMockUser({ is_superuser: false }),
    entities: createMockEntitiesState({
      databases: [database],
      collections: [],
    }),
    settings: mockSettings({
      // Deliberately out of sync: the hook must ignore this stale setting.
      "uploads-settings": {
        db_id: staleUploadsSettingDbId,
        schema_name: "uploads",
        table_prefix: "uploaded_",
      },
    }),
  });

  setupDatabaseListEndpoint([database]);

  return renderHookWithProviders(() => useAddDataState(), {
    storeInitialState,
  });
}

describe("useAddDataState", () => {
  it("reports the list as loading before it arrives", () => {
    // Callers must tell "cannot upload anywhere" apart from "not fetched yet".
    const { result } = setup({ canUpload: true });

    expect(result.current.areDatabasesLoading).toBe(true);
    expect(result.current.canUploadToDatabase).toBe(false);
  });

  it("reports uploads as enabled even when the cached setting says otherwise", async () => {
    const { result } = setup({
      canUpload: true,
      uploadsEnabled: true,
      staleUploadsSettingDbId: null,
    });

    await waitFor(() => {
      expect(result.current.areUploadsEnabled).toBe(true);
    });
    expect(result.current.canUploadToDatabase).toBe(true);
  });

  it("reports uploads as disabled even when the cached setting points at a database", async () => {
    const { result } = setup({
      canUpload: false,
      uploadsEnabled: false,
      staleUploadsSettingDbId: 1,
    });

    await waitFor(() => {
      expect(result.current.areDatabasesLoading).toBe(false);
    });
    expect(result.current.areUploadsEnabled).toBe(false);
    expect(result.current.canUploadToDatabase).toBe(false);
  });

  it("separates uploads being enabled from the user being allowed to upload", async () => {
    const { result } = setup({ canUpload: false, uploadsEnabled: true });

    await waitFor(() => {
      expect(result.current.areUploadsEnabled).toBe(true);
    });
    expect(result.current.canUploadToDatabase).toBe(false);
  });
});
