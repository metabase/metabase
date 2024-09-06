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
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import {
  ChartTypeSettings,
  type GetSensibleVisualizationsProps,
  type UseChartTypeVisualizationsProps,
  useChartTypeVisualizations,
} from "metabase/query_builder/components/chart-type-selector";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { CardDisplayType } from "metabase-types/api";
import { Stack } from "metabase/ui";

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
    onUpdateQuestion,
  });

  console.log({
    selectedVisualization,
    updateQuestionVisualization,
    sensibleVisualizations,
    nonSensibleVisualizations,
  })

  const handleSelectVisualization = (display: CardDisplayType) => {
    console.log(display, selectedVisualization)
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
      <Stack spacing={0} m="lg">
        <ChartTypeSettings
          selectedVisualization={selectedVisualization}
          onSelectVisualization={handleSelectVisualization}
          sensibleVisualizations={sensibleVisualizations}
          nonSensibleVisualizations={nonSensibleVisualizations}
        />
      </Stack>
    </SidebarContent>
  );
};
