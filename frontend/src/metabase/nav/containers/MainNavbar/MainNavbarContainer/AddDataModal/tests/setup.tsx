import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupDatabaseListEndpoint,
  setupGdriveGetFolderEndpoint,
  setupGdrivePostFolderEndpoint,
  setupGdriveServiceAccountEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import type { UserWithApplicationPermissions } from "metabase/plugins";
import type { GdrivePayload, TokenFeatures } from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { AddDataModal } from "../AddDataModal";

interface SetupOpts {
  isAdmin?: boolean;
  opened?: boolean;
  uploadsEnabled?: boolean;
  canUpload?: boolean;
  canManageSettings?: boolean;
  isHosted?: boolean;
  hasEnterprisePlugins?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
  enableGoogleSheets?: boolean;
  status?: GdrivePayload["status"];
}

export const setup = ({
  isAdmin = true,
  opened = true,
  uploadsEnabled = false,
  canUpload = true,
  canManageSettings = false,
  isHosted = false,
  hasEnterprisePlugins = false,
  tokenFeatures = {},
  enableGoogleSheets = false,
  status,
}: SetupOpts = {}) => {
  const user = {
    is_superuser: isAdmin,
  };

  if (canManageSettings) {
    (user as UserWithApplicationPermissions).permissions = {
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

  const collections = [rootCollection];
  const databases = [database];

  const state = createMockState({
    currentUser: createMockUser(user),
    entities: createMockEntitiesState({
      databases,
      collections,
    }),
    settings: mockSettings({
      "is-hosted?": isHosted,
      "show-google-sheets-integration": enableGoogleSheets,
      "token-features": createMockTokenFeatures(tokenFeatures),
      "uploads-settings": {
        db_id: uploadsEnabled ? database.id : null,
        schema_name: "uploads",
        table_prefix: "uploaded_",
      },
    }),
  });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  setupDatabaseListEndpoint(databases);

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
    hasEnterprisePlugins: true,
    tokenFeatures: { advanced_permissions: true },
  });
};

export const setupHostedInstance = (opts: Partial<SetupOpts>) => {
  return setup({
    ...opts,
    isHosted: true,
    hasEnterprisePlugins: true,
    tokenFeatures: { hosting: true, ...opts.tokenFeatures },
  });
};

export const setupProUpload = (opts: Partial<SetupOpts>) =>
  setupHostedInstance({
    ...opts,
    tokenFeatures: { attached_dwh: true },
  });
