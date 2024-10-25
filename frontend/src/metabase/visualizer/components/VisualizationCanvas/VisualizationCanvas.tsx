import { useCallback } from "react";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { Center, Flex, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import {
  getVisualizerComputedSettings,
  getVisualizerRawSeries,
  updateSettings,
} from "metabase/visualizer/visualizer.slice";
import type { VisualizationSettings } from "metabase-types/api";

import { BottomWell } from "./BottomWell";
import { VerticalWell } from "./VerticalWell";

export function VisualizationCanvas() {
  const rawSeries = useSelector(getVisualizerRawSeries);
  const settings = useSelector(getVisualizerComputedSettings);
  const dispatch = useDispatch();

  const { card } = rawSeries[0] ?? {};
  const hasSeriesToShow = rawSeries.length > 0;

  const handleUpdateSettings = useCallback(
    (settings: VisualizationSettings) => {
      dispatch(updateSettings(settings));
    },
    [dispatch],
  );

  if (!hasSeriesToShow) {
    return (
      <Center h="100%" w="100%" mx="auto">
        <Text>{t`Visualization will appear here`}</Text>
      </Center>
    );
  }

  return (
    <Flex w="100%" h="100%">
      <VerticalWell display={card.display} settings={settings} />
      <Flex direction="column" style={{ flex: 1 }}>
        <Visualization rawSeries={rawSeries} />
        <BottomWell
          display={card.display}
          settings={settings}
          w="95%"
          style={{ alignSelf: "center" }}
          onChangeSettings={handleUpdateSettings}
        />
      </Flex>
    </Flex>
  );
}
