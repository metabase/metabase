import { P, match } from "ts-pattern";

import { PLUGIN_RESOURCE_DOWNLOADS } from "metabase/plugins";
import type { EmbedResourceDownloadOptions } from "metabase/public/lib/types";
import { hasPremiumFeature } from "metabase-enterprise/settings";

if (hasPremiumFeature("whitelabel")) {
  /**
   * Returns if 'download results' on cards and pdf exports are enabled in public and embedded contexts.
   */
  PLUGIN_RESOURCE_DOWNLOADS.areDownloadsEnabled = ({
    hide_download_button,
    downloads,
  }: {
    hide_download_button?: boolean | null;
    downloads?: string | boolean | null;
  }): EmbedResourceDownloadOptions => {
    return (
      match({ hide_download_button, downloads })
        // `downloads` has priority over `hide_download_button`
        .with({ downloads: true }, () => ({ pdf: true, results: true }))
        .with({ downloads: false }, () => ({ pdf: false, results: false }))
        // supports `downloads=pdf`, `downloads=results` and `downloads=pdf,results`
        .with(
          { downloads: P.string },
          ({ downloads }: { downloads: string }) => {
            const downloadTypes = downloads
              .split(",")
              .map((type: string) => type.trim());

            return {
              pdf: downloadTypes.includes("pdf"),
              results: downloadTypes.includes("results"),
            };
          },
        )
        // but we still support the old `hide_download_button` option
        .with({ hide_download_button: true }, () => ({
          pdf: false,
          results: false,
        }))
        // by default downloads are enabled
        .otherwise(() => ({ pdf: true, results: true }))
    );
  };
}
