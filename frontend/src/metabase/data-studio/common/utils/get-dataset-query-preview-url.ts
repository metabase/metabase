import type { DraftQuestionBuilder } from "metabase/metadata-store";
import * as Urls from "metabase/urls";
import type { DatasetQuery } from "metabase-types/api";

export function getDatasetQueryPreviewUrl(
  definition: DatasetQuery | null | undefined,
  buildQuestion: DraftQuestionBuilder,
): string | undefined {
  if (!definition) {
    return undefined;
  }
  return Urls.newQuestion(buildQuestion({ dataset_query: definition }));
}
