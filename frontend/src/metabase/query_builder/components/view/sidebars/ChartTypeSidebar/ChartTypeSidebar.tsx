import _ from "underscore";

import { useDispatch } from "metabase/lib/redux";
import { setUIControls, updateQuestion } from "metabase/query_builder/actions";
import {
  ChartTypeSettings,
  type GetSensibleVisualizationsProps,
  type UseChartTypeVisualizationsProps,
  useChartTypeVisualizations,
} from "metabase/query_builder/components/chart-type-selector";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { CardDisplayType } from "metabase-types/api";

export type ChartTypeSidebarProps = Pick<
  UseChartTypeVisualizationsProps,
  "question"
> &
  GetSensibleVisualizationsProps;

export const ChartTypeSidebar = ({
  question,
  result,
}: ChartTypeSidebarProps) => {
  const dispatch = useDispatch();

  const onUpdateQuestion = (newQuestion: Question) => {
    if (question) {
      dispatch(
        updateQuestion(newQuestion, {
          shouldUpdateUrl: Lib.queryDisplayInfo(question.query()).isEditable,
        }),
      );
      dispatch(setUIControls({ isShowingRawTable: false }));
    }
  };

  const {
    selectedVisualization,
    updateQuestionVisualization,
    sensibleVisualizations,
    nonSensibleVisualizations,
  } = useChartTypeVisualizations({
    question,
    result,
    onUpdateQuestion,
  });

  const handleSelectVisualization = (display: CardDisplayType) => {
    updateQuestionVisualization(display);
  };

  return (
    <ChartTypeSettings
      selectedVisualization={selectedVisualization}
      onSelectVisualization={handleSelectVisualization}
      sensibleVisualizations={sensibleVisualizations}
      nonSensibleVisualizations={nonSensibleVisualizations}
      spacing={0}
      w="100%"
      p="lg"
    />
  );
};
