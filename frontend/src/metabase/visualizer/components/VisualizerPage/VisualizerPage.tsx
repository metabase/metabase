import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useCallback, useState } from "react";

import { useDispatch } from "metabase/lib/redux";
import { Box, Flex } from "metabase/ui";
import { DROPPABLE_ID } from "metabase/visualizer/dnd/constants";
import {
  isDraggedColumnItem,
  isValidDraggedItem,
} from "metabase/visualizer/dnd/guards";
import type { DraggedItem } from "metabase/visualizer/dnd/types";
import { updateSettings } from "metabase/visualizer/visualizer.slice";

import { DataImporter } from "../DataImporter";
import { DataManager } from "../DataManager";
import { DragOverlay as VisualizerDragOverlay } from "../DragOverlay";
import { VisualizationCanvas } from "../VisualizationCanvas";

export const VisualizerPage = () => {
  const [draggedItem, setDraggedItem] = useState<DraggedItem | null>();
  const dispatch = useDispatch();

  const handleDragStart = useCallback((event: DragStartEvent) => {
    if (isValidDraggedItem(event.active)) {
      setDraggedItem(event.active);
    }
  }, []);

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      if (
        over?.id === DROPPABLE_ID.VERTICAL_WELL &&
        isDraggedColumnItem(active)
      ) {
        dispatch(updateSettings({ "funnel.metric": active.id }));
      }

      if (
        over?.id === DROPPABLE_ID.HORIZONTAL_WELL &&
        isDraggedColumnItem(active)
      ) {
        dispatch(updateSettings({ "funnel.dimension": active.id }));
      }

      setDraggedItem(null);
    },
    [dispatch],
  );

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <Flex style={{ height: "100%", overflow: "hidden" }}>
        <Flex direction="column" w={320}>
          <Box h="50%" p={10} pr={0} style={{ overflowY: "hidden" }}>
            <DataImporter />
          </Box>
          <Box h="50%" pl={10} pb={10} style={{ overflowY: "auto" }}>
            <DataManager />
          </Box>
        </Flex>
        <Box
          component="main"
          w="100%"
          h="100%"
          m={10}
          p="xl"
          bg="white"
          style={{
            borderRadius: "var(--default-border-radius)",
            overflowY: "hidden",
          }}
        >
          <VisualizationCanvas />
        </Box>
      </Flex>
      <DragOverlay dropAnimation={null}>
        {draggedItem && <VisualizerDragOverlay item={draggedItem} />}
      </DragOverlay>
    </DndContext>
  );
};
