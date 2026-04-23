import cx from "classnames";
import { useMemo, useRef } from "react";
import { t } from "ttag";

import { SidebarContent } from "metabase/common/components/SidebarContent";
import CS from "metabase/css/core/index.css";
import { updateQuestion } from "metabase/query_builder/actions";
import {
  ChartTypeSettings,
  type GetSensibleVisualizationsProps,
  type UseQuestionVisualizationStateProps,
  getSensibleVisualizations,
  useQuestionVisualizationState,
} from "metabase/query_builder/components/chart-type-selector";
import {
  onCloseChartType,
  onOpenChartSettings,
  setUIControls,
} from "metabase/redux/query-builder";
import { useDispatch } from "metabase/utils/redux";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { CardDisplayType } from "metabase-types/api";

export type ChartTypeSidebarProps = Pick<
  UseQuestionVisualizationStateProps,
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

  // Pinned to mount so chart type grouping stays stable while browsing (metabase#70013)
  const initialResultRef = useRef(result);
  const { sensibleVisualizations, nonSensibleVisualizations } = useMemo(
    () => getSensibleVisualizations({ result: initialResultRef.current }),
    [],
  );

  const { selectedVisualization, updateQuestionVisualization } =
    useQuestionVisualizationState({
      question,
      onUpdateQuestion,
    });

  const handleSelectVisualization = (display: CardDisplayType) => {
    updateQuestionVisualization(display);
  };

  const onOpenVizSettings = () => {
    dispatch(
      onOpenChartSettings({
        initialChartSettings: { section: t`Data` },
        showSidebarTitle: true,
      }),
    );
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
        onOpenSettings={onOpenVizSettings}
        gap={0}
        w="100%"
        p="lg"
      />
    </SidebarContent>
  );
};
