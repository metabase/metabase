import type { EmbeddingDisplayOptions } from "metabase/public/lib/types";

export function getDefaultDisplayOptions(
  shouldShownDownloadData: boolean,
): EmbeddingDisplayOptions {
  return {
    font: null,
    theme: "light",
    bordered: true,
    titled: true,
    hide_download_button: shouldShownDownloadData ? false : null,
  };
}
