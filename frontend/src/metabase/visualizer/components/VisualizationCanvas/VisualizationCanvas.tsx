import { useDroppable } from "@dnd-kit/core";
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
import Visualization from "metabase/visualizations/components/Visualization";
import { DROPPABLE_ID } from "metabase/visualizer/constants";
import {
  getIsLoading,
  getVisualizationType,
  getVisualizerRawSeries,
} from "metabase/visualizer/selectors";

import { TabularPreviewModal } from "../TabularPreviewModal";

import { HorizontalWell } from "./HorizontalWell";
import { ScatterFloatingWell } from "./ScatterFloatingWell";
import { StartFromViz } from "./StartFromViz";
import { VerticalWell } from "./VerticalWell";
import Styles from "./VisualizationCanvas.module.css";

export function VisualizationCanvas() {
  const [isTabularPreviewOpen, setTabularPreviewOpen] = useState(false);

  const display = useSelector(getVisualizationType);
  const rawSeries = useSelector(getVisualizerRawSeries);
  const isLoading = useSelector(getIsLoading);

  const { setNodeRef } = useDroppable({ id: DROPPABLE_ID.CANVAS_MAIN });

  if (!display && !isLoading) {
    return (
      <Center h="100%" w="100%" mx="auto">
        <StartFromViz />
      </Center>
    );
  }

  if (!display || rawSeries.length === 0) {
    return (
      <Center h="100%" w="100%" mx="auto">
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
      <Box className={Styles.Container} ref={setNodeRef}>
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
