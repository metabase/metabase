import type { DatasetQuery } from "metabase-types/api";
import * as Urls from "metabase/urls";

export function getDatasetQueryPreviewUrl(
  definition: DatasetQuery | null | undefined,
): string | undefined {
  if (!definition) {
    return undefined;
  }
  return Urls.newQuestion({ dataset_query: definition });
}
