import { useMemo } from "react";

import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";
import type {
  QueryTransformSource,
  VisualizationSettings,
} from "metabase-types/api";

const DEFAULT_VIZ_SETTINGS: VisualizationSettings = {
  "table.pivot": false,
};

export function useSourceQuery(
  source: QueryTransformSource,
  onSourceChange: (newSource: QueryTransformSource) => void,
) {
  const metadata = useSelector(getMetadata);

  const question = useMemo(
    () =>
      Question.create({
        dataset_query: source.query,
        metadata,
        visualization_settings: DEFAULT_VIZ_SETTINGS,
      }),
    [source, metadata],
  );

  const handleChangeQuestion = (newQuestion: Question) => {
    onSourceChange({ type: "query", query: newQuestion.datasetQuery() });
  };

  return { question, handleChangeQuestion };
}
