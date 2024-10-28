import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useCallback } from "react";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { Box, Flex } from "metabase/ui";
import { DROPPABLE_ID } from "metabase/visualizer/dnd/constants";
import {
  isDraggedColumnItem,
  isValidDraggedItem,
} from "metabase/visualizer/dnd/guards";
import {
  getDraggedItem,
  setDraggedItem,
  updateSettings,
} from "metabase/visualizer/visualizer.slice";

import { DataImporter } from "../DataImporter";
import { DataManager } from "../DataManager";
import { DragOverlay as VisualizerDragOverlay } from "../DragOverlay";
import { Header } from "../Header";
import { VisualizationCanvas } from "../VisualizationCanvas";

export const VisualizerPage = () => {
  const draggedItem = useSelector(getDraggedItem);
  const dispatch = useDispatch();

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      if (isValidDraggedItem(event.active)) {
        dispatch(
          setDraggedItem({
            id: event.active.id,
            data: {
              current: event.active.data.current,
            },
          }),
        );
      }
    },
    [dispatch],
  );

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

      dispatch(setDraggedItem(null));
    },
    [dispatch],
  );

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <Flex direction="column" w="100%" h="100%">
        <Header />
        <Flex style={{ overflow: "hidden", flexGrow: 1 }}>
          <Flex direction="column" miw={320}>
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
            m={10}
            p="xl"
            bg="white"
            style={{
              borderRadius: "var(--default-border-radius)",
              overflowY: "hidden",
              border: `1px solid var(--mb-color-border)`,
              boxShadow: "0 1px 2px 2px var(--mb-color-border)",
            }}
          >
            <VisualizationCanvas />
          </Box>
        </Flex>
        <DragOverlay dropAnimation={null}>
          {draggedItem && <VisualizerDragOverlay item={draggedItem} />}
        </DragOverlay>
      </Flex>
    </DndContext>
  );
};
