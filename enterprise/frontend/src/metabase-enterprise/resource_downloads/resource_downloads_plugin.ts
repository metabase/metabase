import { P, match } from "ts-pattern";

import { PLUGIN_RESOURCE_DOWNLOADS } from "metabase/plugins";
import type { EmbedResourceDownloadOptions } from "metabase/public/lib/types";
import { hasPremiumFeature } from "metabase-enterprise/settings";

if (hasPremiumFeature("whitelabel")) {
  /**
   * Returns if 'download results' on cards and pdf exports are enabled in public and embedded contexts.
   */
  PLUGIN_RESOURCE_DOWNLOADS.areDownloadsEnabled = ({
    downloads,
  }: {
    downloads?: string | boolean | null;
  }): EmbedResourceDownloadOptions => {
    return (
      match({ downloads })
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
        // by default downloads are enabled
        .otherwise(() => ({ pdf: true, results: true }))
    );
  };
}
