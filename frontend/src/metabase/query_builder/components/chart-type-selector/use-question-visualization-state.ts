import { useCallback } from "react";

import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins";
import visualizations from "metabase/visualizations";
import type Question from "metabase-lib/v1/Question";
import type { VisualizationDisplay } from "metabase-types/api";

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
      if (PLUGIN_CUSTOM_VIZ.isCustomVizDisplay(display)) {
        PLUGIN_CUSTOM_VIZ.trackCustomVizSelected();
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
