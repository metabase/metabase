import { useMemo, useState } from "react";

import { useQuestionFromOpts } from "metabase/metadata-store";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { VisualizationSettings } from "metabase-types/api";

import type { QueryEditorUiOptions } from "../../types";

const DEFAULT_VIZ_SETTINGS: VisualizationSettings = {
  "table.pivot": false,
};

export function useQueryQuestion(
  query: Lib.Query,
  {
    cardType,
    cardDisplay,
    cardVizSettings = DEFAULT_VIZ_SETTINGS,
  }: QueryEditorUiOptions = {},
  onChangeQuery: (newQuery: Lib.Query) => void,
) {
  const buildQuestion = useQuestionFromOpts();
  const [parameterValues, setParameterValues] = useState({});

  const { question } = useMemo(
    () => ({
      question: buildQuestion({
        dataset_query: Lib.toJsQuery(query),
        cardType,
        display: cardDisplay,
        visualization_settings: cardVizSettings,
        parameterValues,
      }),
    }),
    [
      query,
      buildQuestion,
      cardType,
      cardDisplay,
      cardVizSettings,
      parameterValues,
    ],
  );

  const setQuestion = (newQuestion: Question) => {
    onChangeQuery(newQuestion.query());
  };

  return {
    question,
    setQuestion,
    parameterValues,
    setParameterValues,
  };
}
