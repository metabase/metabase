import { match } from "ts-pattern";

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
    downloads?: boolean | null;
  }) => {
    return (
      match({ hide_download_button, downloads })
        // `downloads` has priority over `hide_download_button`
        .with({ downloads: true }, () => true)
        .with({ downloads: false }, () => false)
        // but we still support the old `hide_download_button` option
        .with({ hide_download_button: true }, () => false)
        // by default downloads are enabled
        .otherwise(() => true)
    );
  };
}
