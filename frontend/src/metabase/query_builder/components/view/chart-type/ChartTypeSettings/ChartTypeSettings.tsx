import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import {
  onOpenChartSettings,
  setUIControls,
  updateQuestion,
} from "metabase/query_builder/actions";
import { Space, Stack, Text } from "metabase/ui";
import visualizations from "metabase/visualizations";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type Query from "metabase-lib/v1/queries/Query";
import type { CardDisplayType, Dataset } from "metabase-types/api";

import { ChartTypeList } from "../ChartTypeList";

import { getSensibleVisualizations } from "./util";

type ChartTypeSettingsProps = {
  question: Question;
  result: Dataset;
  query: Query;
};

function useChartVisualizationSettings(question: Question) {
  const dispatch = useDispatch();

  const setSelectedVisualization = useCallback(
    (display: CardDisplayType) => {
      let newQuestion = question.setDisplay(display).lockDisplay(); // prevent viz auto-selection
      const visualization = visualizations.get(display);
      if (visualization?.onDisplayUpdate) {
        const updatedSettings = visualization.onDisplayUpdate(
          newQuestion.settings(),
        );
        newQuestion = newQuestion.setSettings(updatedSettings);
      }

      dispatch(
        updateQuestion(newQuestion, {
          shouldUpdateUrl: Lib.queryDisplayInfo(question.query()).isEditable,
        }),
      );
      dispatch(setUIControls({ isShowingRawTable: false }));
    },
    [dispatch, question],
  );

  const selectedVisualization = question.display();

  return { selectedVisualization, setSelectedVisualization };
}

export const ChartTypeSettings = ({
  query,
  question,
  result,
}: ChartTypeSettingsProps) => {
  const dispatch = useDispatch();

  const { selectedVisualization, setSelectedVisualization } =
    useChartVisualizationSettings(question);

  const [makesSense, nonSense] = useMemo(
    () => getSensibleVisualizations({ result, query }),
    [query, result],
  );

  const openChartSettings = useCallback(() => {
    dispatch(
      onOpenChartSettings({
        initialChartSettings: { section: t`Data` },
        showSidebarTitle: true,
      }),
    );
  }, [dispatch]);

  const handleClick = (vizType: CardDisplayType) =>
    selectedVisualization === vizType
      ? openChartSettings()
      : setSelectedVisualization(vizType);

  return (
    <Stack spacing={0} m="lg">
      <ChartTypeList
        data-is-sensible={true}
        visualizationList={makesSense}
        selectedVisualization={selectedVisualization}
        onClick={handleClick}
      />

      <Space h="xl" />

      <Text
        fw="bold"
        color="text-medium"
        tt="uppercase"
        fz="sm"
      >{t`Other charts`}</Text>

      <Space h="sm" />

      <ChartTypeList
        data-is-sensible={false}
        visualizationList={nonSense}
        selectedVisualization={selectedVisualization}
        onClick={handleClick}
      />
    </Stack>
  );
};
