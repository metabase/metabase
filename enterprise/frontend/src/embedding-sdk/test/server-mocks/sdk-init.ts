import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCurrentUserEndpoint,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import type { SdkState, SdkStoreState } from "embedding-sdk/store/types";
import {
  createMockLoginStatusState,
  createMockSdkState,
} from "embedding-sdk/test/mocks/state";
import type { EnterpriseSettings } from "metabase-enterprise/settings/types";
import type {
  User,
  TokenFeatures,
  SettingDefinition,
} from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

export const setupSdkState = ({
  currentUser = createMockUser(),
  settingValues = createMockSettings(),
  tokenFeatures = createMockTokenFeatures(),
  settingDefinitions = [],
  sdkState = createMockSdkState({
    loginStatus: createMockLoginStatusState({ status: "success" }),
  }),
  ...stateOpts
}: {
  currentUser: User;
  settingValues?: EnterpriseSettings;
  tokenFeatures?: TokenFeatures;
  settingDefinitions?: SettingDefinition[];
  sdkState?: SdkState;
} & Partial<SdkStoreState>) => {
  const settingValuesWithToken = {
    ...settingValues,
    "token-features": tokenFeatures,
  };

  setupEnterprisePlugins();
  setupCurrentUserEndpoint(currentUser);
  setupSettingsEndpoints(settingDefinitions);
  setupPropertiesEndpoints(settingValuesWithToken);

  const state = createMockState({
    settings: mockSettings(settingValuesWithToken),
    currentUser,
    sdk: sdkState,
    ...stateOpts,
  });

  return {
    currentUser,
    state,
  };
};
