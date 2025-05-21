import type { EmbeddingDisplayOptions } from "metabase/public/lib/types";

export function getDefaultDisplayOptions(
  shouldShownDownloadData: boolean,
): EmbeddingDisplayOptions {
  return {
    font: null,
    theme: "light",
    background: true,
    bordered: true,
    titled: true,
    downloads: shouldShownDownloadData ? { pdf: true, results: true } : null,
  };
}
