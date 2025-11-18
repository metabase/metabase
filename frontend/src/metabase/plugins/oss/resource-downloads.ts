import type { EmbedResourceDownloadOptions } from "metabase/public/lib/types";

export const PLUGIN_RESOURCE_DOWNLOADS = {
  areDownloadsEnabled: (_args: {
    downloads?: string | boolean | null;
  }): EmbedResourceDownloadOptions => ({
    pdf: true,
    results: true,
  }),
};
