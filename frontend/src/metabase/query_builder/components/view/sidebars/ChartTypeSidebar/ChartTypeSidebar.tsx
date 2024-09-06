import cx from "classnames";
import { t } from "ttag";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import { useDispatch } from "metabase/lib/redux";
import {
  onCloseChartType,
  onOpenChartSettings,
  setUIControls,
  updateQuestion,
} from "metabase/query_builder/actions";
import { ChartTypeSettings } from "metabase/query_builder/components/ChartTypeSelector/ChartTypeSettings";
import {
  type GetSensibleVisualizationsProps,
  type UseChartTypeVisualizationsProps,
  useChartTypeVisualizations,
} from "metabase/query_builder/components/ChartTypeSelector/use-chart-type-visualizations";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { CardDisplayType } from "metabase-types/api";

export const ChartTypeSidebar = ({
  question,
  result,
}: UseChartTypeVisualizationsProps & GetSensibleVisualizationsProps) => {
  const dispatch = useDispatch();

  const onUpdateQuestion = (newQuestion: Question) => {
    dispatch(
      updateQuestion(newQuestion, {
        shouldUpdateUrl: Lib.queryDisplayInfo(question.query()).isEditable,
      }),
    );
    dispatch(setUIControls({ isShowingRawTable: false }));
  };

  const {
    selectedVisualization,
    updateQuestionVisualization,
    sensibleVisualizations,
    nonSensibleVisualizations,
  } = useChartTypeVisualizations({
    question,
    result,
    onUpdateQuestion: onUpdateQuestion,
  });

  const handleSelectVisualization = (display: CardDisplayType) => {
    if (display === selectedVisualization) {
      dispatch(
        onOpenChartSettings({
          initialChartSettings: { section: t`Data` },
          showSidebarTitle: true,
        }),
      );
    } else {
      updateQuestionVisualization(display);
    }
  };

  return (
    <SidebarContent
      className={cx(CS.fullHeight, CS.px1)}
      onDone={() => dispatch(onCloseChartType())}
      data-testid="chart-type-sidebar"
    >
      <ChartTypeSettings
        selectedVisualization={selectedVisualization}
        onSelectVisualization={handleSelectVisualization}
        sensibleVisualizations={sensibleVisualizations}
        nonSensibleVisualizations={nonSensibleVisualizations}
      />
    </SidebarContent>
  );
};
