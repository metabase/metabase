import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupApiKeyEndpoints,
  setupCurrentUserEndpoint,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import type { User } from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

export const getSdkTestSetup = ({
  currentUser,
  isValidAuthentication = true,
}: {
  currentUser: User;
  isValidAuthentication?: boolean;
}) => {
  setupCurrentUserEndpoint(
    currentUser,
    isValidAuthentication
      ? undefined
      : {
          response: 500,
        },
  );

  const settingValues = createMockSettings();
  const tokenFeatures = createMockTokenFeatures();
  const settings = [
    createMockSettingDefinition({
      key: "token-features",
      value: tokenFeatures,
    }),
  ];

  const settingValuesWithToken = {
    ...settingValues,
    "token-features": tokenFeatures,
  };
  const state = createMockState({
    settings: mockSettings(settingValuesWithToken),
    currentUser,
  });

  setupEnterprisePlugins();
  setupApiKeyEndpoints([]);
  setupSettingsEndpoints(settings);
  setupPropertiesEndpoints(settingValuesWithToken);

  return state;
};
