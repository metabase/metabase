import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupDatabaseListEndpoint,
  setupGdriveGetFolderEndpoint,
  setupGdrivePostFolderEndpoint,
  setupGdriveServiceAccountEndpoint,
  setupPropertiesEndpoints,
  setupTokenRefreshEndpoint,
  setupTokenStatusEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { createMockState } from "metabase/redux/store/mocks";
import type {
  GdrivePayload,
  ICloudAddOnProduct,
  TokenFeatures,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { AddDataModal } from "../AddDataModal";

interface SetupOpts {
  isAdmin?: boolean;
  opened?: boolean;
  uploadsEnabled?: boolean;
  canUpload?: boolean;
  canManageSettings?: boolean;
  isHosted?: boolean;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  tokenFeatures?: Partial<TokenFeatures>;
  enableGoogleSheets?: boolean;
  status?: GdrivePayload["status"];
  adminEmail?: string | null;
  addOns?: ICloudAddOnProduct[];
  /**
   * Defaults to following the token feature. Set `false` for the window between
   * purchase and redeploy, or storage that never materialized.
   */
  hasAttachedDwhDatabase?: boolean;
  /** False in the window before the redeploy makes storage the upload target. */
  dwhCanUpload?: boolean;
}

export const setup = ({
  isAdmin = true,
  opened = true,
  uploadsEnabled = false,
  canUpload = true,
  canManageSettings = false,
  isHosted = false,
  enterprisePlugins,
  tokenFeatures = {},
  enableGoogleSheets = false,
  status,
  adminEmail = "admin@metabase.test",
  addOns = [],
  hasAttachedDwhDatabase = !!tokenFeatures.attached_dwh,
  dwhCanUpload = true,
}: SetupOpts = {}) => {
  const user = createMockUser({
    is_superuser: isAdmin,
  });

  if (canManageSettings) {
    user.permissions = {
      can_access_setting: true,
      can_access_monitoring: false,
      can_access_subscription: false,
    };
  }

  const rootCollection = createMockCollection({
    ...ROOT_COLLECTION,
    can_write: true,
  });

  const database = createMockDatabase({
    uploads_enabled: uploadsEnabled,
    can_upload: isAdmin || canUpload,
  });

  // The storage UI keys off the attached DWH appearing in the databases list,
  // not the `attached_dwh` token, which flips earlier — hence two controls.
  const attachedDwhDatabase = hasAttachedDwhDatabase
    ? createMockDatabase({
        id: 2,
        name: "Metabase Storage",
        is_attached_dwh: true,
        can_upload: dwhCanUpload,
      })
    : null;

  const collections = [rootCollection];
  const databases = attachedDwhDatabase
    ? [database, attachedDwhDatabase]
    : [database];

  const settingValues = {
    "admin-email": adminEmail,
    "is-hosted?": isHosted,
    "show-google-sheets-integration": enableGoogleSheets,
    "token-features": createMockTokenFeatures(tokenFeatures),
    "uploads-settings": {
      db_id: uploadsEnabled ? database.id : null,
      schema_name: "uploads",
      table_prefix: "uploaded_",
    },
    "store-url": "https://store.metabase.com",
  };

  const state = createMockState({
    currentUser: createMockUser(user),
    entities: createMockEntitiesState({
      databases,
      collections,
    }),
    settings: mockSettings(settingValues),
  });

  setupPropertiesEndpoints(createMockSettings(settingValues));

  if (enterprisePlugins) {
    enterprisePlugins.forEach((plugin) => {
      setupEnterpriseOnlyPlugin(plugin);
    });
  }
  setupTokenStatusEndpoint({ valid: true });

  setupDatabaseListEndpoint(databases);
  setupCollectionByIdEndpoint({ collections });
  // The storage offer (shown on hosted instances) checks add-on availability.
  fetchMock.get("path:/api/ee/cloud-add-ons/addons", addOns);
  // A purchase posts and then refreshes the token until the new plan lands.
  fetchMock.post("path:/api/ee/cloud-add-ons/dwh-rent", 200);
  setupTokenRefreshEndpoint();

  if (enableGoogleSheets) {
    setupGdrivePostFolderEndpoint();
    setupGdriveGetFolderEndpoint({
      status,
      url: "https://docs.google.example/your-spredsheet",
    });
    setupGdriveServiceAccountEndpoint(
      "super-service-account@testing.metabase.com",
    );
  }

  renderWithProviders(<AddDataModal onClose={jest.fn()} opened={opened} />, {
    storeInitialState: state,
  });
};

export const setupAdvancedPermissions = (opts: Partial<SetupOpts>) => {
  return setup({
    ...opts,
    enterprisePlugins: ["application_permissions"],
    tokenFeatures: { advanced_permissions: true },
  });
};

export const setupHostedInstance = (opts: Partial<SetupOpts>) => {
  return setup({
    ...opts,
    isHosted: true,
    tokenFeatures: { hosting: true, ...opts.tokenFeatures },
    enterprisePlugins: ["upload_management"],
  });
};

export const setupProUpload = (opts: Partial<SetupOpts>) =>
  setupHostedInstance({
    // A provisioned DWH enables uploads, which is what gates the imports link.
    uploadsEnabled: true,
    ...opts,
    tokenFeatures: { attached_dwh: true },
  });
