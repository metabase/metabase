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
import {
  getIsLoading,
  getVisualizationType,
  getVisualizerRawSeries,
} from "metabase/visualizer/selectors";
import type { RawSeries } from "metabase-types/api";

import { TabularPreviewModal } from "../TabularPreviewModal";
import { useVisualizerUi } from "../VisualizerUiContext";

import { HorizontalWell } from "./HorizontalWell";
import { ScatterFloatingWell } from "./ScatterFloatingWell";
import { StartFromViz } from "./StartFromViz";
import { VerticalWell } from "./VerticalWell";
import S from "./VisualizationCanvas.module.css";

function disableAxisLabels(rawSeries: RawSeries) {
  return produce(rawSeries, (draft) => {
    const settings = draft[0]?.card.visualization_settings;

    if (!settings) {
      return draft;
    }

    settings["graph.x_axis.labels_enabled"] = false;
    settings["graph.y_axis.labels_enabled"] = false;
    draft[0].card.visualization_settings = settings;
  });
}

interface VisualizationCanvasProps {
  className?: string;
}

export function VisualizationCanvas({ className }: VisualizationCanvasProps) {
  const [isTabularPreviewOpen, setTabularPreviewOpen] = useState(false);
  const { isSwapAffordanceVisible } = useVisualizerUi();

  const display = useSelector(getVisualizationType);
  const isLoading = useSelector(getIsLoading);

  let rawSeries = useSelector(getVisualizerRawSeries);
  if (display && isCartesianChart(display)) {
    rawSeries = disableAxisLabels(rawSeries);
  }

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
          <Loader data-testid="visualization-canvas-loader" size="lg" />
        ) : (
          <Text>{t`Visualization will appear here`}</Text>
        )}
      </Center>
    );
  }

  return (
    <>
      <Box
        className={`${S.Container} ${className}`}
        data-testid="visualization-canvas"
      >
        <Box style={{ gridArea: "left" }} data-testid="vertical-well">
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

        <Box style={{ gridArea: "bottom" }} data-testid="horizontal-well">
          <HorizontalWell display={display} />
        </Box>
        {display === "scatter" && (
          <Box style={{ gridArea: "top-right" }}>
            <ScatterFloatingWell />
          </Box>
        )}
        <Center
          className={`${S.SwapAffordance} ${isSwapAffordanceVisible ? S.visible : ""}`}
        >
          <Center className={S.SwapAffordanceIcon}>
            <Icon name="sync" />
          </Center>
        </Center>
      </Box>
      <TabularPreviewModal
        opened={isTabularPreviewOpen}
        onClose={() => setTabularPreviewOpen(false)}
      />
    </>
  );
}
