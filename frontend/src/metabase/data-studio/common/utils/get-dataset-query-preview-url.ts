import * as Urls from "metabase/lib/urls";
import type { DatasetQuery } from "metabase-types/api";

export function getDatasetQueryPreviewUrl(
  definition: DatasetQuery | null | undefined,
): string | undefined {
  if (!definition) {
    return undefined;
  }
  return Urls.newQuestion({ dataset_query: definition });
}
