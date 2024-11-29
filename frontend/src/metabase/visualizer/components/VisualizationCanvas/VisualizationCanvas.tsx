import { useDroppable } from "@dnd-kit/core";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { Center, Flex, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { DROPPABLE_ID } from "metabase/visualizer/constants";
import {
  getDatasets,
  getVisualizationType,
  getVisualizerRawSeries,
} from "metabase/visualizer/selectors";

import { HorizontalWell } from "./HorizontalWell";
import { ScatterFloatingWell } from "./ScatterFloatingWell";
import { StartFromViz } from "./StartFromViz";
import { VerticalWell } from "./VerticalWell";

export function VisualizationCanvas() {
  const datasets = useSelector(getDatasets);
  const display = useSelector(getVisualizationType);
  const rawSeries = useSelector(getVisualizerRawSeries);

  const { setNodeRef } = useDroppable({ id: DROPPABLE_ID.CANVAS_MAIN });

  const hasDatasets = Object.entries(datasets).length > 0;
  const hasSeriesToShow = rawSeries.length > 0 && display;

  if (!hasDatasets && !display) {
    return (
      <Center h="100%" w="100%" mx="auto">
        <StartFromViz />
      </Center>
    );
  }
  if (!hasSeriesToShow) {
    return (
      <Center h="100%" w="100%" mx="auto">
        <Text>{t`Visualization will appear here`}</Text>
      </Center>
    );
  }

  return (
    <Flex w="100%" h="100%" pos="relative" ref={setNodeRef}>
      <VerticalWell display={display} />
      <Flex direction="column" style={{ flex: 1 }}>
        <Visualization
          rawSeries={rawSeries}
          // TableInteractive crashes when trying to use metabase-lib
          isDashboard={display === "table"}
        />
        <HorizontalWell
          display={display}
          w="95%"
          style={{ alignSelf: "center" }}
        />
      </Flex>
      {display === "scatter" && <ScatterFloatingWell />}
    </Flex>
  );
}
