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

  return (
    <Flex
      w="100%"
      h="100%"
      direction="column"
      bg="white"
      style={{ borderRadius: "var(--default-border-radius)" }}
    >
      {hasSeriesToShow ? (
        <>
          <Visualization rawSeries={rawSeries} />
          <BottomWell
            display={card.display}
            settings={settings}
            w="95%"
            style={{ alignSelf: "center" }}
            onChangeSettings={handleUpdateSettings}
          />
        </>
      ) : (
        <Center h="100%" w="100%" mx="auto">
          <Text>{t`Visualization will appear here`}</Text>
        </Center>
      )}
    </Flex>
  );
}
