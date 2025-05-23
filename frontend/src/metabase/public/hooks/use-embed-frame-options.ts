import type { Location } from "history";
import { useEffect } from "react";

import { parseHashOptions } from "metabase/lib/browser";
import { isWithinIframe } from "metabase/lib/dom";
import { PLUGIN_RESOURCE_DOWNLOADS } from "metabase/plugins";

import { DEFAULT_EMBED_DISPLAY_PARAMS } from "../constants";
import type { EmbeddingHashOptions } from "../lib/types";

export const useEmbedFrameOptions = ({ location }: { location: Location }) => {
  const {
    background = true,
    bordered = isWithinIframe(),
    titled = DEFAULT_EMBED_DISPLAY_PARAMS.titled,
    theme = DEFAULT_EMBED_DISPLAY_PARAMS.theme,
    hide_parameters = DEFAULT_EMBED_DISPLAY_PARAMS.hideParameters,
    hide_download_button = null,
    downloads = DEFAULT_EMBED_DISPLAY_PARAMS.downloadsEnabled,
    locale,
  } = parseHashOptions(location.hash) as EmbeddingHashOptions & {
    // this parameter is not supported anymore, but we access it in this hook to log an error
    hide_download_button?: boolean | null;
  };

  useEffect(() => {
    if (hide_download_button !== null) {
      console.error(
        "%c⚠️ The `hide_download_button` option has been removed. Please use the `downloads` option instead.",
        "font-size: 14px; font-weight: bold; color: red",
      );
    }
  }, [hide_download_button]);

  const downloadsEnabled = PLUGIN_RESOURCE_DOWNLOADS.areDownloadsEnabled({
    downloads,
  });

  return {
    background,
    bordered,
    titled,
    theme,
    hide_parameters,
    downloadsEnabled,
    locale,
  };
};
