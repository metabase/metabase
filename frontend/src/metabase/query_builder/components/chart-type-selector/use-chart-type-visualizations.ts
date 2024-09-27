import { useCallback, useMemo } from "react";
import _ from "underscore";

import visualizations from "metabase/visualizations";
import { sanatizeResultData } from "metabase/visualizations/shared/utils/data";
import type Question from "metabase-lib/v1/Question";
import {
  type CardDisplayType,
  type Dataset,
  type VisualizationDisplay,
  isCardDisplayType,
} from "metabase-types/api";

import { DEFAULT_VIZ_ORDER } from "./viz-order";

export type UseChartTypeVisualizationsProps = {
  question?: Question;
  onUpdateQuestion: (question: Question) => void;
} & GetSensibleVisualizationsProps;

export const useChartTypeVisualizations = ({
  question,
  onUpdateQuestion,
  result,
}: UseChartTypeVisualizationsProps) => {
  const selectedVisualization = question?.display() ?? "table";

  const updateQuestionVisualization = useCallback(
    (display: CardDisplayType) => {
      if (question) {
        let newQuestion = question.setDisplay(display).lockDisplay(); // prevent viz auto-selection
        const visualization = visualizations.get(display);
        if (visualization?.onDisplayUpdate) {
          const updatedSettings = visualization.onDisplayUpdate(
            newQuestion.settings(),
          );
          newQuestion = newQuestion.setSettings(updatedSettings);
        }

        onUpdateQuestion(newQuestion);
      }
    },
    [onUpdateQuestion, question],
  );

  const { sensibleVisualizations, nonSensibleVisualizations } = useMemo(
    () => getSensibleVisualizations({ result }),
    [result],
  );

  return {
    selectedVisualization,
    updateQuestionVisualization,
    sensibleVisualizations,
    nonSensibleVisualizations,
  };
};

type IsSensibleVisualizationProps = {
  result: Dataset | null;
  vizType: VisualizationDisplay;
};

const isSensibleVisualization = ({
  result,
  vizType,
}: IsSensibleVisualizationProps) => {
  const visualization = visualizations.get(vizType);
  return (
    (result?.data &&
      visualization?.isSensible?.(sanatizeResultData(result.data))) ||
    false
  );
};

export type GetSensibleVisualizationsProps = {
  result: Dataset | null;
};

export const getSensibleVisualizations = ({
  result,
}: GetSensibleVisualizationsProps) => {
  const availableVizTypes = Array.from(visualizations.entries())
    .filter(([_, config]) => !config.hidden)
    .map(([vizType]) => vizType)
    .filter(isCardDisplayType);

  const orderedVizTypes = _.union(DEFAULT_VIZ_ORDER, availableVizTypes);

  const [sensibleVisualizations, nonSensibleVisualizations] = _.partition(
    orderedVizTypes,
    vizType => isSensibleVisualization({ result, vizType }),
  );

  return { sensibleVisualizations, nonSensibleVisualizations };
};
