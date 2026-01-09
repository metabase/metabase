import { useMemo } from "react";

import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { VisualizationSettings } from "metabase-types/api";

import type { QueryEditorUiOptions } from "../../types";

const DEFAULT_VIZ_SETTINGS: VisualizationSettings = {
  "table.pivot": false,
};

export function useQueryQuestion(
  query: Lib.Query,
  proposedQuery: Lib.Query | undefined,
  {
    cardType,
    cardDisplay,
    cardVizSettings = DEFAULT_VIZ_SETTINGS,
  }: QueryEditorUiOptions = {},
  onChangeQuery: (newQuery: Lib.Query) => void,
) {
  const metadata = useSelector(getMetadata);

  const { question, proposedQuestion } = useMemo(
    () => ({
      question: Question.create({
        dataset_query: Lib.toJsQuery(query),
        metadata,
        cardType,
        display: cardDisplay,
        visualization_settings: cardVizSettings,
      }),
      proposedQuestion:
        proposedQuery != null
          ? Question.create({
              dataset_query: Lib.toJsQuery(proposedQuery),
              metadata,
              visualization_settings: DEFAULT_VIZ_SETTINGS,
            })
          : undefined,
    }),
    [query, proposedQuery, metadata, cardType, cardDisplay, cardVizSettings],
  );

  const setQuestion = (newQuestion: Question) => {
    onChangeQuery(newQuestion.query());
  };

  return { question, proposedQuestion, setQuestion };
}
