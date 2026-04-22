import type { EmbeddingDisplayOptions } from "metabase/embedding/types";

export function getDefaultDisplayOptions(
  shouldShownDownloadData: boolean,
): EmbeddingDisplayOptions {
  return {
    font: "",
    theme: "light",
    background: true,
    bordered: true,
    titled: true,
    downloads: shouldShownDownloadData ? { pdf: true, results: true } : null,
  };
}
