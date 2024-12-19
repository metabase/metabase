import { useDroppable } from "@dnd-kit/core";
import { useState } from "react";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import {
  ActionIcon,
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
            w="90%"
            style={{ alignSelf: "center" }}
          />
        </Flex>
        {display === "scatter" && <ScatterFloatingWell />}
        <Tooltip label={t`View as table`}>
          <ActionIcon
            pos="absolute"
            right={0}
            bottom={0}
            onClick={() => setTabularPreviewOpen(true)}
          >
            <Icon name="table" />
          </ActionIcon>
        </Tooltip>
      </Flex>
      <TabularPreviewModal
        opened={isTabularPreviewOpen}
        onClose={() => setTabularPreviewOpen(false)}
      />
    </>
  );
}
