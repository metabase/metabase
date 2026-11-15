import type { EmbedResourceDownloadOptions } from "metabase-types/api";

import { definePluginSlot } from "../slot";

const getDefaultPluginResourceDownloads = () => ({
  areDownloadsEnabled: (_args: {
    downloads?: string | boolean | null;
  }): EmbedResourceDownloadOptions => ({
    pdf: true,
    results: true,
  }),
});

export const PLUGIN_RESOURCE_DOWNLOADS = definePluginSlot(
  getDefaultPluginResourceDownloads,
);
