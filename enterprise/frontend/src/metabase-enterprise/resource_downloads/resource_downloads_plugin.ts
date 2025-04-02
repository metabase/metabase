import { P, match } from "ts-pattern";

import { PLUGIN_RESOURCE_DOWNLOADS } from "metabase/plugins";
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
  }): { pdf: boolean; cardResult: boolean } => {
    const matchResult = match({ hide_download_button, downloads })
      // `downloads` has priority over `hide_download_button`
      .with({ downloads: true }, () => ({ pdf: true, cardResult: true }))
      .with({ downloads: false }, () => ({ pdf: false, cardResult: false }))
      .with({ downloads: P.string }, () => {
        // console.log("Parsed:", { downloads });

        return {
          pdf: true,
          cardResult: true,
        };
      })
      // but we still support the old `hide_download_button` option
      .with({ hide_download_button: true }, () => ({
        pdf: false,
        cardResult: false,
      }))
      // by default downloads are enabled
      .otherwise(() => ({ pdf: true, cardResult: true }));

    // console.log("Match result:", matchResult);

    return matchResult;
  };
}
