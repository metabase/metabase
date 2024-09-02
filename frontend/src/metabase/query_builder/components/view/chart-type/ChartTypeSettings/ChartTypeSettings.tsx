import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { onOpenChartSettings } from "metabase/query_builder/actions";
import { Space, Stack, Text } from "metabase/ui";
import visualizations from "metabase/visualizations";
import type Question from "metabase-lib/v1/Question";
import type { CardDisplayType } from "metabase-types/api";

import { ChartTypeList } from "../ChartTypeList";

import {
  type GetSensibleVisualizationsProps,
  getSensibleVisualizations,
} from "./util";

export type ChartTypeSettingsProps = ChartVisualizationControls;

export type ChartVisualizationControlsProps = {
  question?: Question;
  onVisualizationChange: (question: Question) => void;
} & GetSensibleVisualizationsProps;

export type ChartVisualizationControls = {
  selectedVisualization: CardDisplayType;
  setSelectedVisualization: (display: CardDisplayType) => void;
  makesSense: CardDisplayType[];
  nonSense: CardDisplayType[];
};

export const useChartVisualizationSettings = ({
  query,
  question,
  result,
  onVisualizationChange,
}: ChartVisualizationControlsProps): ChartVisualizationControls => {
  const [makesSense, nonSense]: [CardDisplayType[], CardDisplayType[]] =
    useMemo(
      () => getSensibleVisualizations({ result, query }),
      [query, result],
    );

  const setSelectedVisualization = useCallback(
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

        onVisualizationChange(newQuestion);
      }
    },
    [onVisualizationChange, question],
  );

  const selectedVisualization: CardDisplayType = question?.display() ?? "table";

  return {
    selectedVisualization,
    setSelectedVisualization,
    makesSense,
    nonSense,
  };
};

export const ChartTypeSettings = ({
  selectedVisualization,
  setSelectedVisualization,
  makesSense,
  nonSense,
}: ChartTypeSettingsProps) => {
  const dispatch = useDispatch();

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
