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
  addDataSourceVizMapping,
  getDraggedItem,
  getVisualizationType,
  setDisplay,
  setDraggedItem,
  updateSettings,
} from "metabase/visualizer/visualizer.slice";
import type { VisualizationDisplay } from "metabase-types/api";

import { DataImporter } from "../DataImporter";
import { DataManager } from "../DataManager";
import { DragOverlay as VisualizerDragOverlay } from "../DragOverlay";
import { VisualizationCanvas } from "../VisualizationCanvas";
import { VisualizationPicker } from "../VisualizationPicker";

export const VisualizerPage = () => {
  const display = useSelector(getVisualizationType);
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

      if (
        over?.id === DROPPABLE_ID.CANVAS_MAIN &&
        isDraggedColumnItem(active)
      ) {
        const { column, dataSource } = active.data.current;
        dispatch(
          addDataSourceVizMapping({
            key: "funnel.metric",
            value: [
              {
                sourceId: dataSource.id,
                column: column.name,
              },
            ],
          }),
        );
      }

      dispatch(setDraggedItem(null));
    },
    [dispatch],
  );

  const handleChangeDisplay = useCallback(
    (nextDisplay: string) => {
      dispatch(setDisplay(nextDisplay as VisualizationDisplay));
    },
    [dispatch],
  );

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <Flex style={{ height: "100%", overflow: "hidden" }}>
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
          px="xl"
          bg="white"
          style={{
            borderRadius: "var(--default-border-radius)",
            overflowY: "hidden",
            border: `1px solid var(--mb-color-border)`,
            boxShadow: "0 1px 2px 2px var(--mb-color-border)",
          }}
        >
          <Flex direction="row" align="center" justify="space-between">
            <p>Name your visualization</p>
            <VisualizationPicker
              value={display}
              onChange={handleChangeDisplay}
            />
          </Flex>
          <Box h="90%">
            <VisualizationCanvas />
          </Box>
        </Box>
      </Flex>
      <DragOverlay dropAnimation={null}>
        {draggedItem && <VisualizerDragOverlay item={draggedItem} />}
      </DragOverlay>
    </DndContext>
  );
};
