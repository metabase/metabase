import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useSensor,
} from "@dnd-kit/core";
import { useCallback, useEffect } from "react";
import type { WithRouterProps } from "react-router";
import { useKeyPressEvent, usePrevious, useUnmount } from "react-use";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { Box, Flex } from "metabase/ui";
import { useVisualizerHistory } from "metabase/visualizer/hooks/use-visualizer-history";
import { useVisualizerUrlSync } from "metabase/visualizer/hooks/use-visualizer-url-sync";
import {
  getDatasets,
  getDraggedItem,
  getIsDirty,
  getIsVizSettingsSidebarOpen,
  getVisualizationType,
} from "metabase/visualizer/selectors";
import { isValidDraggedItem } from "metabase/visualizer/utils";
import {
  closeVizSettingsSidebar,
  handleDrop,
  resetVisualizer,
  setDisplay,
  setDraggedItem,
} from "metabase/visualizer/visualizer.slice";
import type { VisualizationDisplay } from "metabase-types/api";

import { DataImporter } from "../DataImporter";
import { DataManager } from "../DataManager";
import { DragOverlay as VisualizerDragOverlay } from "../DragOverlay";
import { Header } from "../Header";
import { VisualizationCanvas } from "../VisualizationCanvas";
import { VisualizationPicker } from "../VisualizationPicker";
import { VizSettingsSidebar } from "../VizSettingsSidebar/VizSettingsSidebar";

export const VisualizerPage = ({ location, router }: WithRouterProps) => {
  const { canUndo, canRedo, undo, redo } = useVisualizerHistory();

  const display = useSelector(getVisualizationType);
  const draggedItem = useSelector(getDraggedItem);
  const datasets = useSelector(getDatasets);
  const isVizSettingsSidebarOpen = useSelector(getIsVizSettingsSidebarOpen);

  const isDirty = useSelector(getIsDirty);
  const wasDirty = usePrevious(isDirty);

  const dispatch = useDispatch();

  const hasDatasets = Object.values(datasets).length > 0;

  const canvasSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 10 },
  });

  useVisualizerUrlSync(location, router);

  useEffect(() => {
    if (wasDirty && !isDirty) {
      dispatch(closeVizSettingsSidebar());
    }
  }, [isDirty, wasDirty, dispatch]);

  useUnmount(() => {
    dispatch(resetVisualizer({ full: true }));
  });

  useKeyPressEvent("z", event => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      if (event.shiftKey) {
        if (canRedo) {
          redo();
        }
      } else if (canUndo) {
        undo();
      }
    }
  });

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
    (event: DragEndEvent) => {
      dispatch(handleDrop(event));
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
    <DndContext
      sensors={[canvasSensor]}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
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
            px="xl"
            bg="white"
            style={{
              borderRadius: "var(--default-border-radius)",
              overflowY: "hidden",
              border: `1px solid var(--mb-color-border)`,
              boxShadow: "0 1px 2px 2px var(--mb-color-border)",
            }}
          >
            {hasDatasets && (
              <Flex direction="row" align="center" justify="space-between">
                <p>Name your visualization</p>
                <VisualizationPicker
                  value={display}
                  onChange={handleChangeDisplay}
                />
              </Flex>
            )}
            <Box h="90%">
              <VisualizationCanvas />
            </Box>
          </Box>
          {isVizSettingsSidebarOpen && (
            <Flex direction="column" miw={320}>
              <VizSettingsSidebar />
            </Flex>
          )}
        </Flex>
        <DragOverlay dropAnimation={null}>
          {draggedItem && <VisualizerDragOverlay item={draggedItem} />}
        </DragOverlay>
      </Flex>
    </DndContext>
  );
};
