import { useDroppable } from "@dnd-kit/core";
import produce from "immer";
import { useState } from "react";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import {
  ActionIcon,
  Box,
  Center,
  Flex,
  Icon,
  Loader,
  Text,
  Tooltip,
} from "metabase/ui";
import { isCartesianChart } from "metabase/visualizations";
import Visualization from "metabase/visualizations/components/Visualization";
import { DROPPABLE_ID } from "metabase/visualizer/constants";
import {
  getIsLoading,
  getVisualizationType,
  getVisualizerRawSeries,
} from "metabase/visualizer/selectors";
import type { RawSeries } from "metabase-types/api";

import { TabularPreviewModal } from "../TabularPreviewModal";

import { HorizontalWell } from "./HorizontalWell";
import { ScatterFloatingWell } from "./ScatterFloatingWell";
import { StartFromViz } from "./StartFromViz";
import { VerticalWell } from "./VerticalWell";
import Styles from "./VisualizationCanvas.module.css";

function disableAxisLabels(rawSeries: RawSeries) {
  return produce(rawSeries, draft => {
    const settings = draft[0]?.card.visualization_settings;

    if (!settings) {
      return draft;
    }

    settings["graph.x_axis.labels_enabled"] = false;
    settings["graph.y_axis.labels_enabled"] = false;
    draft[0].card.visualization_settings = settings;
  });
}

export function VisualizationCanvas({ className }: { className?: string }) {
  const [isTabularPreviewOpen, setTabularPreviewOpen] = useState(false);

  const display = useSelector(getVisualizationType);
  let rawSeries = useSelector(getVisualizerRawSeries);
  if (display && isCartesianChart(display)) {
    rawSeries = disableAxisLabels(rawSeries);
  }

  const isLoading = useSelector(getIsLoading);

  const { setNodeRef } = useDroppable({ id: DROPPABLE_ID.CANVAS_MAIN });

  if (!display && !isLoading) {
    return (
      <Center h="100%" w="100%" mx="auto" className={className}>
        <StartFromViz />
      </Center>
    );
  }

  if (!display || rawSeries.length === 0) {
    return (
      <Center h="100%" w="100%" mx="auto" className={className}>
        {isLoading ? (
          <Loader size="lg" />
        ) : (
          <Text>{t`Visualization will appear here`}</Text>
        )}
      </Center>
    );
  }

  return (
    <>
      <Box className={`${Styles.Container} ${className}`} ref={setNodeRef}>
        <Box style={{ gridArea: "left" }}>
          <VerticalWell display={display} />
        </Box>

        <Box style={{ gridArea: "main" }}>
          <Visualization
            rawSeries={rawSeries}
            // TableInteractive crashes when trying to use metabase-lib
            isDashboard={display === "table"}
          />
        </Box>

        <Flex
          align="center"
          justify="left"
          pl="7px"
          style={{ gridArea: "bottom-left" }}
        >
          <Tooltip label={t`View as table`}>
            <ActionIcon onClick={() => setTabularPreviewOpen(true)}>
              <Icon name="table" />
            </ActionIcon>
          </Tooltip>
        </Flex>

        <Box style={{ gridArea: "bottom" }}>
          <HorizontalWell display={display} />
        </Box>
        {display === "scatter" && (
          <Box style={{ gridArea: "top-right" }}>
            <ScatterFloatingWell />
          </Box>
        )}
      </Box>
      <TabularPreviewModal
        opened={isTabularPreviewOpen}
        onClose={() => setTabularPreviewOpen(false)}
      />
    </>
  );
}
