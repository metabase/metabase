import { definePluginSlot } from "metabase/plugin-slots";
import type { EmbedResourceDownloadOptions } from "metabase-types/api";

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
