import { useCallback } from "react";
import _ from "underscore";

import visualizations from "metabase/visualizations";
import { sanitizeResultData } from "metabase/visualizations/shared/utils/data";
import type Question from "metabase-lib/v1/Question";
import {
  type Dataset,
  type QueryVisualizationDisplayType,
  type VisualizationDisplay,
  isCardDisplayType,
} from "metabase-types/api";
import { isCustomVizDisplay } from "metabase-types/guards/visualization";

import { groupVisualizationsBySensibility } from "./sensibility-grouping";
import { DEFAULT_VIZ_ORDER } from "./viz-order";

export type UseQuestionVisualizationStateProps = {
  question?: Question;
  onUpdateQuestion: (question: Question) => void;
};

export const useQuestionVisualizationState = ({
  question,
  onUpdateQuestion,
}: UseQuestionVisualizationStateProps) => {
  const selectedVisualization = question?.display() ?? "table";

  const updateQuestionVisualization = useCallback(
    (display: VisualizationDisplay) => {
      if (!question || selectedVisualization === display) {
        return;
      }
      let newQuestion = question.setDisplay(display).lockDisplay();
      const visualization = visualizations.get(display);
      if (visualization?.onDisplayUpdate) {
        const updatedSettings = visualization.onDisplayUpdate(
          newQuestion.settings(),
        );
        newQuestion = newQuestion.setSettings(updatedSettings);
      }
      onUpdateQuestion(newQuestion);
    },
    [onUpdateQuestion, question, selectedVisualization],
  );

  return {
    selectedVisualization,
    updateQuestionVisualization,
  };
};

export type GetSensibleVisualizationsProps = {
  result: Dataset | null;
};

const isSupportedVisualization = (
  display: string,
): display is QueryVisualizationDisplayType =>
  isCardDisplayType(display) || isCustomVizDisplay(display);

export const getSensibleVisualizations = ({
  result,
}: GetSensibleVisualizationsProps) => {
  const availableVizTypes = Array.from(visualizations.entries()).reduce<
    QueryVisualizationDisplayType[]
  >((types, [vizType, config]) => {
    if (!config.hidden && isSupportedVisualization(vizType)) {
      types.push(vizType);
    }

    return types;
  }, []);

  const orderedVizTypes = _.union(DEFAULT_VIZ_ORDER, availableVizTypes);

  if (result?.data) {
    const sanitizedData = sanitizeResultData(result.data);

    const { recommended, sensible, nonsensible } =
      groupVisualizationsBySensibility({
        orderedVizTypes,
        data: sanitizedData,
      });

    return {
      sensibleVisualizations: recommended,
      nonSensibleVisualizations: [...sensible, ...nonsensible],
    };
  }

  const [sensibleVisualizations, nonSensibleVisualizations] = _.partition(
    orderedVizTypes,
    (vizType) => {
      const viz = visualizations.get(vizType);
      return Boolean(viz?.isSensible);
    },
  );

  return { sensibleVisualizations, nonSensibleVisualizations };
};
