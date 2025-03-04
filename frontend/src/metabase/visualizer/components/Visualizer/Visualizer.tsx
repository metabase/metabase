import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useSensor,
} from "@dnd-kit/core";
import { useCallback, useEffect } from "react";
import { useKeyPressEvent, usePrevious, useUnmount } from "react-use";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { Box, Flex } from "metabase/ui";
import { useVisualizerHistory } from "metabase/visualizer/hooks/use-visualizer-history";
import {
  getDatasets,
  getDraggedItem,
  getIsDirty,
  getIsFullscreenModeEnabled,
  getIsVizSettingsSidebarOpen,
} from "metabase/visualizer/selectors";
import { isValidDraggedItem } from "metabase/visualizer/utils";
import {
  closeVizSettingsSidebar,
  handleDrop,
  resetVisualizer,
  setDraggedItem,
  turnOffFullscreenMode,
} from "metabase/visualizer/visualizer.slice";
import type { VisualizerHistoryItem } from "metabase-types/store/visualizer";

import { DataImporter } from "../DataImporter";
import { DataManager } from "../DataManager";
import { DragOverlay as VisualizerDragOverlay } from "../DragOverlay";
import { Footer } from "../Footer";
import { Header } from "../Header";
import { VisualizationCanvas } from "../VisualizationCanvas";
import { VizSettingsSidebar } from "../VizSettingsSidebar/VizSettingsSidebar";

interface VisualizerProps {
  className?: string;
  onSave?: (visualization: VisualizerHistoryItem) => void;
  saveLabel?: string;
}

export const Visualizer = (props: VisualizerProps) => {
  const { className, onSave, saveLabel } = props;
  const { canUndo, canRedo, undo, redo } = useVisualizerHistory();

  const draggedItem = useSelector(getDraggedItem);
  const datasets = useSelector(getDatasets);
  const isFullscreen = useSelector(getIsFullscreenModeEnabled);
  const isVizSettingsSidebarOpen = useSelector(getIsVizSettingsSidebarOpen);

  const isDirty = useSelector(getIsDirty);
  const wasDirty = usePrevious(isDirty);

  const dispatch = useDispatch();

  const hasDatasets = Object.values(datasets).length > 0;

  const canvasSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 10 },
  });

  useEffect(() => {
    if (wasDirty && !isDirty) {
      dispatch(closeVizSettingsSidebar());
      dispatch(turnOffFullscreenMode());
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

  return (
    <DndContext
      sensors={[canvasSensor]}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <Flex className={className} direction="column">
        <Flex style={{ overflow: "hidden", flexGrow: 1 }}>
          {!isFullscreen && (
            <Flex direction="column" miw={320}>
              <Box h="50%" p={10} pr={0} style={{ overflowY: "hidden" }}>
                <DataImporter />
              </Box>
              <Box h="50%" pl={10} pb={10} style={{ overflowY: "auto" }}>
                <DataManager />
              </Box>
            </Flex>
          )}

          <Flex direction="column" w="100%">
            <Header onSave={onSave} saveLabel={saveLabel} />
            <Flex
              ml="lg"
              mr="lg"
              mb="md"
              flex={1}
              direction="column"
              bg="white"
              style={{
                borderRadius: "var(--default-border-radius)",
                overflowY: "hidden",
                border: `1px solid var(--mb-color-border)`,
                boxShadow: "0 1px 2px 2px var(--mb-color-border)",
              }}
            >
              <Box px="xl" mb="lg" flex={1}>
                <VisualizationCanvas />
              </Box>
              {hasDatasets && <Footer />}
            </Flex>
          </Flex>
          {!isFullscreen && isVizSettingsSidebarOpen && (
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
