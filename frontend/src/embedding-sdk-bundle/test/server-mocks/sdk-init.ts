import {
  setupCurrentUserEndpoint,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import type { SdkState, SdkStoreState } from "embedding-sdk-bundle/store/types";
import {
  createMockLoginStatusState,
  createMockSdkState,
} from "embedding-sdk-bundle/test/mocks/state";
import type {
  EnterpriseSettings,
  SettingDefinition,
  TokenFeatures,
  User,
} from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  createMockEmbedState,
  createMockState,
} from "metabase-types/store/mocks";

export const setupSdkState = ({
  currentUser = createMockUser(),
  settingValues = createMockSettings({ "enable-embedding-sdk": true }),
  tokenFeatures = createMockTokenFeatures({ embedding_sdk: true }),
  settingDefinitions = [],
  sdkState = createMockSdkState({
    initStatus: createMockLoginStatusState({ status: "success" }),
  }),
  ...stateOpts
}: {
  currentUser?: User;
  settingValues?: EnterpriseSettings;
  tokenFeatures?: Partial<TokenFeatures>;
  settingDefinitions?: SettingDefinition[];
  sdkState?: SdkState;
} & Partial<SdkStoreState> = {}) => {
  const settingValuesWithToken = {
    ...settingValues,
    "token-features": createMockTokenFeatures(tokenFeatures),
  };

  setupCurrentUserEndpoint(currentUser);
  setupSettingsEndpoints(settingDefinitions);
  setupPropertiesEndpoints(settingValuesWithToken);

  const state = createMockState({
    settings: mockSettings(settingValuesWithToken),
    currentUser,
    sdk: sdkState,
    embed: createMockEmbedState(),
    ...stateOpts,
  });

  return {
    currentUser,
    state,
  };
};
