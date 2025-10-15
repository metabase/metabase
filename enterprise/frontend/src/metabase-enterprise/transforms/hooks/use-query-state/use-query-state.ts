import { useMemo, useState } from "react";

import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { DatasetQuery, VisualizationSettings } from "metabase-types/api";

const DEFAULT_VIZ_SETTINGS: VisualizationSettings = {
  "table.pivot": false,
};

export function useQueryState(initialQuery: DatasetQuery) {
  const [query, setQuery] = useState(initialQuery);
  const metadata = useSelector(getMetadata);

  const question = useMemo(
    () =>
      Question.create({
        dataset_query: query,
        metadata,
        visualization_settings: DEFAULT_VIZ_SETTINGS,
      }),
    [query, metadata],
  );

  const isQueryDirty = useMemo(
    () => !Lib.areLegacyQueriesEqual(query, initialQuery),
    [query, initialQuery],
  );

  const setQuestion = (newQuestion: Question) => {
    setQuery(newQuestion.datasetQuery());
  };

  return { question, isQueryDirty, setQuestion };
}
