import * as Urls from "metabase/lib/urls";
import type { DatasetQuery, Measure } from "metabase-types/api";

export function getMeasurePreviewUrl(measure: Measure): string | undefined {
  if (!measure.definition) {
    return undefined;
  }
  return Urls.newQuestion({ dataset_query: measure.definition });
}

export function getPreviewUrl(
  definition: DatasetQuery | null,
): string | undefined {
  if (!definition) {
    return undefined;
  }
  return Urls.newQuestion({ dataset_query: definition });
}
