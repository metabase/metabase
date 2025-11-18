import type { EmbedResourceDownloadOptions } from "metabase/public/lib/types";

const getDefaultPluginResourceDownloads = () => ({
  areDownloadsEnabled: (_args: {
    downloads?: string | boolean | null;
  }): EmbedResourceDownloadOptions => ({
    pdf: true,
    results: true,
  }),
});

export const PLUGIN_RESOURCE_DOWNLOADS = getDefaultPluginResourceDownloads();

export function reinitialize() {
  Object.assign(PLUGIN_RESOURCE_DOWNLOADS, getDefaultPluginResourceDownloads());
}
