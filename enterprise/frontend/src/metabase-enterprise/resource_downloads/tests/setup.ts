import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import type { TokenFeatures } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

export interface SetupOpts {
  tokenFeatures?: TokenFeatures;
  hasEnterprisePlugins?: boolean;
}

export const setup = ({
  tokenFeatures = createMockTokenFeatures(),
  hasEnterprisePlugins = false,
}: SetupOpts = {}) => {
  mockSettings({ "token-features": tokenFeatures });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }
};

export const downloadsEnabledTestData = [
  { hide_download_button: true, downloads: true, downloadsEnabled: true },
  { hide_download_button: true, downloads: false, downloadsEnabled: false },
  { hide_download_button: true, downloads: undefined, downloadsEnabled: false },
  { hide_download_button: false, downloads: true, downloadsEnabled: true },
  { hide_download_button: false, downloads: false, downloadsEnabled: false },
  { hide_download_button: false, downloads: undefined, downloadsEnabled: true },
  { hide_download_button: undefined, downloads: true, downloadsEnabled: true },
  {
    hide_download_button: undefined,
    downloads: false,
    downloadsEnabled: false,
  },
  {
    hide_download_button: undefined,
    downloads: undefined,
    downloadsEnabled: true,
  },
];
