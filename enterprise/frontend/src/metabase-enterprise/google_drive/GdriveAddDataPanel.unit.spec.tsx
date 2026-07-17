import fetchMock from "fetch-mock";

import {
  setupDatabaseListEndpoint,
  setupGdriveGetFolderEndpoint,
  setupGdriveServiceAccountEndpoint,
  setupPropertiesEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { StorageSetupProvider } from "metabase-enterprise/storage/StorageSetupProvider";
import type { TokenFeatures } from "metabase-types/api";
import {
  createMockDatabase,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { mockStorageCloudAddOn } from "metabase-types/api/mocks/add-ons";

import { GdriveAddDataPanel } from "./GdriveAddDataPanel";

interface SetupOpts {
  isAdmin?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
  hasAttachedDwhDatabase?: boolean;
  canUploadToDwh?: boolean;
}

const setup = ({
  isAdmin = true,
  tokenFeatures = {},
  hasAttachedDwhDatabase = false,
  canUploadToDwh = true,
}: SetupOpts = {}) => {
  const settingValues = {
    "is-hosted?": true,
    "store-url": "https://store.metabase.com",
    "show-google-sheets-integration": true,
    "token-features": createMockTokenFeatures(tokenFeatures),
  };

  setupPropertiesEndpoints(createMockSettings(settingValues));
  setupDatabaseListEndpoint(
    hasAttachedDwhDatabase
      ? [
          createMockDatabase({
            id: 1,
            can_upload: canUploadToDwh,
            is_attached_dwh: true,
          }),
        ]
      : [],
  );
  setupGdriveGetFolderEndpoint({ status: "not-connected" });
  setupGdriveServiceAccountEndpoint("service-account@testing.metabase.com");
  fetchMock.get("path:/api/ee/cloud-add-ons/addons", [mockStorageCloudAddOn]);
  fetchMock.post("path:/api/premium-features/token/refresh", {});

  renderWithProviders(
    <StorageSetupProvider>
      <GdriveAddDataPanel onAddDataModalClose={jest.fn()} />
    </StorageSetupProvider>,
    {
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: isAdmin }),
        settings: mockSettings(settingValues),
      }),
    },
  );
};

describe("GdriveAddDataPanel storage states", () => {
  it("points non-admins at their administrator", async () => {
    setup({ isAdmin: false });

    expect(
      await screen.findByText(
        /To enable Google Sheets import, please contact your administrator/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Add Metabase Storage/ }),
    ).not.toBeInTheDocument();
  });

  it("offers to add storage when the instance has none", async () => {
    setup();

    expect(
      await screen.findByText(
        /To work with spreadsheets, you can add storage to your instance\./,
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /Add Metabase Storage/ }),
    ).toBeInTheDocument();
  });

  it("shows the setting-up view while storage is provisioning", async () => {
    // Token feature flipped, DWH database not synced yet — the mid-provisioning
    // window (e.g. before the post-purchase redeploy finishes).
    setup({ tokenFeatures: { attached_dwh: true } });

    expect(await screen.findByText("Setting up storage")).toBeInTheDocument();
  });

  it("proceeds to the connect flow when storage exists, even if its database does not accept uploads", async () => {
    // CSV uploads being disabled on the storage database must not gate Google
    // Sheets sync, and re-offering storage the instance already has would be
    // wrong (#77822 follow-up: this state used to read as provisioning).
    setup({
      tokenFeatures: { attached_dwh: true },
      hasAttachedDwhDatabase: true,
      canUploadToDwh: false,
    });

    expect(
      await screen.findByRole("button", { name: "Connect" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Setting up storage")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Add Metabase Storage/ }),
    ).not.toBeInTheDocument();
  });
});
