import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { useDispatch } from "metabase/lib/redux";
import {
  onCloseChartType,
  setUIControls,
  updateQuestion,
} from "metabase/query_builder/actions";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import { ChartTypeSettings } from "metabase/query_builder/components/view/chart-type/ChartTypeSettings";
import {
  type ChartVisualizationControlsProps,
  useChartVisualizationSettings,
} from "metabase/query_builder/components/view/chart-type/ChartTypeSettings/ChartTypeSettings";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

export const ChartTypeSidebar = ({
  question,
  result,
  query,
}: Omit<ChartVisualizationControlsProps, "onVisualizationChange">) => {
  const dispatch = useDispatch();

  const onVisualizationChange = (newQuestion: Question) => {
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
    setSelectedVisualization,
    makesSense,
    nonSense,
  } = useChartVisualizationSettings({
    question,
    result,
    query,
    onVisualizationChange,
  });

  return (
    <SidebarContent
      className={cx(CS.fullHeight, CS.px1)}
      onDone={() => dispatch(onCloseChartType())}
      data-testid="chart-type-sidebar"
    >
      <ChartTypeSettings
        selectedVisualization={selectedVisualization}
        setSelectedVisualization={setSelectedVisualization}
        makesSense={makesSense}
        nonSense={nonSense}
      />
    </SidebarContent>
  );
};
