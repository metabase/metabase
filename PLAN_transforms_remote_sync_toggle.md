# Plan: Add Transforms Remote-Sync Toggle Setting

## Overview

Add a toggle setting to enable/disable syncing transforms via remote-sync. The toggle should appear in:
1. The admin remote-sync settings page (`/admin/settings/remote-sync`)
2. The "Set up git sync" modal in the data studio

The backend setting `remote-sync-transforms` already exists in `settings.clj`, but is not exposed through the API or frontend.

## Current State

### Backend
- **Setting exists**: `remote-sync-transforms` in `enterprise/backend/src/metabase_enterprise/remote_sync/settings.clj:89-95`
  - Type: boolean, default: false, visibility: admin
- **Not in API**: The PUT `/api/ee/remote-sync/settings` endpoint does NOT accept `remote-sync-transforms` in its schema
- **Not in settings update function**: `check-and-update-remote-settings!` doesn't process this setting
- **Backend tests exist**: Extensive tests in `transforms_test.clj` and `spec_test.clj`

### Frontend
- **No toggle exists**: `RemoteSyncSettingsForm.tsx` has no transforms toggle
- **No constant**: `constants.ts` doesn't define a key for transforms
- **No type definition**: `EnterpriseSettings` interface doesn't include `remote-sync-transforms`
- **No schema validation**: `REMOTE_SYNC_SCHEMA` doesn't include transforms

## Implementation Plan

### Step 1: Backend API Updates

**File: `enterprise/backend/src/metabase_enterprise/remote_sync/api.clj`**

Update the PUT `/api/ee/remote-sync/settings` endpoint schema (lines 111-121) to accept `remote-sync-transforms`:

```clojure
:- [:map
    [:remote-sync-url {:optional true} [:maybe :string]]
    [:remote-sync-token {:optional true} [:maybe :string]]
    [:remote-sync-type {:optional true} [:maybe [:enum :read-only :read-write]]]
    [:remote-sync-branch {:optional true} [:maybe :string]]
    [:remote-sync-auto-import {:optional true} [:maybe :boolean]]
    [:remote-sync-transforms {:optional true} [:maybe :boolean]]  ;; ADD THIS
    [:collections {:optional true} [:maybe [:map-of pos-int? :boolean]]]]
```

**File: `enterprise/backend/src/metabase_enterprise/remote_sync/settings.clj`**

Update `check-and-update-remote-settings!` function (line 144) to include `:remote-sync-transforms` in the settings keys list:

```clojure
(doseq [k [:remote-sync-url :remote-sync-token :remote-sync-type
           :remote-sync-branch :remote-sync-auto-import :remote-sync-transforms]]
  ...)
```

### Step 2: Frontend Type Definitions

**File: `frontend/src/metabase-types/api/settings.ts`**

Add to `EnterpriseSettings` interface (around line 678):

```typescript
"remote-sync-transforms"?: boolean | null;
```

**File: `frontend/src/metabase-types/api/remote-sync.ts`**

Update `RemoteSyncConfigurationSettings` type (lines 74-83) to include transforms:

```typescript
export type RemoteSyncConfigurationSettings = Pick<
  EnterpriseSettings,
  | "remote-sync-enabled"
  | "remote-sync-url"
  | "remote-sync-token"
  | "remote-sync-type"
  | "remote-sync-branch"
  | "remote-sync-transforms"  // ADD THIS
> & {
  collections?: CollectionSyncPreferences;
};
```

### Step 3: Frontend Constants and Schema

**File: `enterprise/frontend/src/metabase-enterprise/remote_sync/constants.ts`**

Add new constant and update schema:

```typescript
export const TRANSFORMS_KEY = "remote-sync-transforms";

export const REMOTE_SYNC_SCHEMA = Yup.object({
  [REMOTE_SYNC_KEY]: Yup.boolean().nullable().default(true),
  [URL_KEY]: Yup.string().nullable().default(null),
  [TOKEN_KEY]: Yup.string().nullable().default(null),
  [AUTO_IMPORT_KEY]: Yup.boolean().nullable().default(false),
  [TRANSFORMS_KEY]: Yup.boolean().nullable().default(false),  // ADD THIS
  [TYPE_KEY]: Yup.string()
    .oneOf(["read-only", "read-write"] as const)
    .nullable()
    .default("read-only"),
  [BRANCH_KEY]: Yup.string().nullable().default("main"),
  [COLLECTIONS_KEY]: Yup.object().nullable().default({}),
});
```

### Step 4: Frontend Settings Form UI

**File: `enterprise/frontend/src/metabase-enterprise/remote_sync/components/RemoteSyncAdminSettings/RemoteSyncSettingsForm.tsx`**

1. Import the new constant:
```typescript
import {
  AUTO_IMPORT_KEY,
  BRANCH_KEY,
  COLLECTIONS_KEY,
  REMOTE_SYNC_KEY,
  REMOTE_SYNC_SCHEMA,
  TOKEN_KEY,
  TRANSFORMS_KEY,  // ADD THIS
  TYPE_KEY,
  URL_KEY,
} from "../../constants";
```

2. Add a new section for transforms toggle. The toggle should appear after the "Collections to sync" section (around line 432). Add a new section:

```tsx
{/* Section 5: Transforms sync (when enabled and read-write mode) */}
{isRemoteSyncEnabled && (
  <RemoteSyncSettingsSection
    title={t`Transforms`}
    variant={variant}
  >
    <FormSwitch
      label={t`Sync transforms with git`}
      description={t`When enabled, all transforms, transform tags, and transform jobs will be synced.`}
      name={TRANSFORMS_KEY}
      size="sm"
    />
  </RemoteSyncSettingsSection>
)}
```

**Design Considerations:**
- The toggle should only appear when remote-sync is enabled (similar to the Collections section)
- The toggle should work in both read-only and read-write modes
- Include a description explaining what transforms syncing includes

### Step 5: Initial Values in Form

Update the `initialValues` useMemo in `RemoteSyncSettingsForm.tsx` to include the transforms setting from server data (the schema cast will handle this automatically since it's already in settingValues).

No code change needed - the `REMOTE_SYNC_SCHEMA.cast(settingValues, { stripUnknown: true })` will automatically include the transforms setting once it's added to the schema.

### Step 6: Tests

#### Backend Tests

**File: `enterprise/backend/test/metabase_enterprise/remote_sync/api_test.clj`**

Add test cases for the settings endpoint accepting `remote-sync-transforms`:

```clojure
(deftest update-settings-transforms-test
  (testing "PUT /api/ee/remote-sync/settings can update remote-sync-transforms"
    (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                       remote-sync-transforms false]
      (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                            {:remote-sync-transforms true})
      (is (true? (remote-sync.settings/remote-sync-transforms))))))
```

#### Frontend Unit Tests

**File: `enterprise/frontend/src/metabase-enterprise/remote_sync/components/RemoteSyncAdminSettings/RemoteSyncSettingsForm.unit.spec.tsx`**

Add test cases:

```typescript
describe("Transforms sync toggle", () => {
  it("should display transforms toggle when remote sync is enabled", async () => {
    await setup({ isRemoteSyncEnabled: true });
    expect(screen.getByText("Sync transforms with git")).toBeInTheDocument();
  });

  it("should not display transforms toggle when remote sync is disabled", async () => {
    await setup({ isRemoteSyncEnabled: false });
    expect(screen.queryByText("Sync transforms with git")).not.toBeInTheDocument();
  });

  it("should include transforms setting in form submission", async () => {
    const { onSubmit } = await setup({ isRemoteSyncEnabled: true });

    const transformsSwitch = screen.getByRole("switch", { name: /sync transforms/i });
    await userEvent.click(transformsSwitch);

    await userEvent.click(screen.getByTestId("remote-sync-submit-button"));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        "remote-sync-transforms": true,
      })
    );
  });
});
```

#### E2E Tests (Optional)

**File: `e2e/test/scenarios/admin/remote-sync.cy.spec.ts`**

Add E2E test for the transforms toggle:

```typescript
describe("Transforms sync toggle", () => {
  it("should allow enabling/disabling transforms sync", () => {
    cy.visit("/admin/settings/remote-sync");

    // Enable remote sync first
    cy.findByLabelText("Repository URL").type("https://github.com/test/repo.git");
    cy.findByLabelText("Access Token").type("test-token");
    cy.findByText("Set up Remote Sync").click();

    // Toggle transforms
    cy.findByText("Sync transforms with git").should("be.visible");
    cy.findByRole("switch", { name: /sync transforms/i }).click();
    cy.findByText("Save changes").click();

    // Verify saved
    cy.reload();
    cy.findByRole("switch", { name: /sync transforms/i }).should("be.checked");
  });
});
```

## File Change Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `enterprise/backend/src/metabase_enterprise/remote_sync/api.clj` | Modify | Add `remote-sync-transforms` to API schema |
| `enterprise/backend/src/metabase_enterprise/remote_sync/settings.clj` | Modify | Add transforms to `check-and-update-remote-settings!` |
| `frontend/src/metabase-types/api/settings.ts` | Modify | Add `remote-sync-transforms` to EnterpriseSettings |
| `frontend/src/metabase-types/api/remote-sync.ts` | Modify | Add transforms to RemoteSyncConfigurationSettings |
| `enterprise/frontend/src/metabase-enterprise/remote_sync/constants.ts` | Modify | Add TRANSFORMS_KEY and update schema |
| `enterprise/frontend/src/metabase-enterprise/remote_sync/components/RemoteSyncAdminSettings/RemoteSyncSettingsForm.tsx` | Modify | Add transforms toggle UI |
| `enterprise/backend/test/metabase_enterprise/remote_sync/api_test.clj` | Modify | Add tests for transforms setting |
| `enterprise/frontend/src/metabase-enterprise/remote_sync/components/RemoteSyncAdminSettings/RemoteSyncSettingsForm.unit.spec.tsx` | Modify | Add tests for transforms toggle |
| `e2e/test/scenarios/admin/remote-sync.cy.spec.ts` | Modify (Optional) | Add E2E tests |

## Notes

1. **Git Settings Modal**: Since `GitSettingsModal` uses `RemoteSyncSettingsForm` with `variant="settings-modal"`, the transforms toggle will automatically appear in the modal once added to the form component. No separate changes needed for the modal.

2. **Read-only vs Read-write**: The transforms toggle should be available in both modes since transforms can be synced in either direction.

3. **Existing Backend Logic**: The backend already has comprehensive logic for handling transforms sync based on the `remote-sync-transforms` setting. This plan only needs to expose the setting through the API and UI.

4. **Backwards Compatibility**: Setting defaults to `false`, so existing installations won't have transforms sync enabled automatically.
