import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import type { EmbedResourceDownloadOptions } from "metabase/public/lib/types";
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

const ALL_DOWNLOADS_ENABLED: EmbedResourceDownloadOptions = {
  pdf: true,
  results: true,
};

const ALL_DOWNLOADS_DISABLED: EmbedResourceDownloadOptions = {
  pdf: false,
  results: false,
};

export const downloadsEnabledTestData: {
  hide_download_button?: boolean;
  downloads?: string | boolean;
  downloadsEnabled: EmbedResourceDownloadOptions;
}[] = [
  {
    hide_download_button: true,
    downloads: true,
    downloadsEnabled: ALL_DOWNLOADS_ENABLED,
  },
  {
    hide_download_button: true,
    downloads: false,
    downloadsEnabled: ALL_DOWNLOADS_DISABLED,
  },
  {
    hide_download_button: true,
    downloads: undefined,
    downloadsEnabled: ALL_DOWNLOADS_DISABLED,
  },
  {
    hide_download_button: false,
    downloads: true,
    downloadsEnabled: ALL_DOWNLOADS_ENABLED,
  },
  {
    hide_download_button: false,
    downloads: false,
    downloadsEnabled: ALL_DOWNLOADS_DISABLED,
  },
  {
    hide_download_button: false,
    downloads: undefined,
    downloadsEnabled: ALL_DOWNLOADS_ENABLED,
  },
  {
    hide_download_button: undefined,
    downloads: true,
    downloadsEnabled: ALL_DOWNLOADS_ENABLED,
  },
  {
    hide_download_button: undefined,
    downloads: false,
    downloadsEnabled: ALL_DOWNLOADS_DISABLED,
  },
  {
    hide_download_button: undefined,
    downloads: undefined,
    downloadsEnabled: ALL_DOWNLOADS_ENABLED,
  },
  {
    hide_download_button: undefined,
    downloads: "pdf",
    downloadsEnabled: { pdf: true, results: false },
  },
  {
    hide_download_button: undefined,
    downloads: "results",
    downloadsEnabled: { pdf: false, results: true },
  },
  {
    hide_download_button: undefined,
    downloads: "pdf,results",
    downloadsEnabled: ALL_DOWNLOADS_ENABLED,
  },
  {
    hide_download_button: undefined,
    downloads: "results,pdf",
    downloadsEnabled: ALL_DOWNLOADS_ENABLED,
  },
];
