import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import type { EmbedResourceDownloadOptions } from "metabase/public/lib/types";
import type { TokenFeatures } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

export interface SetupOpts {
  tokenFeatures?: TokenFeatures;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
}

export const setup = ({
  tokenFeatures = createMockTokenFeatures(),
  enterprisePlugins,
}: SetupOpts = {}) => {
  mockSettings({ "token-features": tokenFeatures });

  if (enterprisePlugins) {
    enterprisePlugins.forEach((plugin) => {
      setupEnterpriseOnlyPlugin(plugin);
    });
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
  downloads?: string | boolean;
  downloadsEnabled: EmbedResourceDownloadOptions;
}[] = [
  {
    downloads: true,
    downloadsEnabled: ALL_DOWNLOADS_ENABLED,
  },
  {
    downloads: false,
    downloadsEnabled: ALL_DOWNLOADS_DISABLED,
  },
  {
    downloads: undefined,
    downloadsEnabled: ALL_DOWNLOADS_ENABLED,
  },
  {
    downloads: "pdf",
    downloadsEnabled: { pdf: true, results: false },
  },
  {
    downloads: "results",
    downloadsEnabled: { pdf: false, results: true },
  },
  {
    downloads: "pdf,results",
    downloadsEnabled: ALL_DOWNLOADS_ENABLED,
  },
  {
    downloads: "results,pdf",
    downloadsEnabled: ALL_DOWNLOADS_ENABLED,
  },
];
