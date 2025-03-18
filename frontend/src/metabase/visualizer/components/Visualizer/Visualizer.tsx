import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useSensor,
} from "@dnd-kit/core";
import { useDisclosure } from "@mantine/hooks";
import { useCallback, useEffect } from "react";
import { usePrevious, useUnmount } from "react-use";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { Box, Button, Flex, Icon, Title } from "metabase/ui";
import { DROPPABLE_ID } from "metabase/visualizer/constants";
import { useVisualizerHistory } from "metabase/visualizer/hooks/use-visualizer-history";
import {
  getDraggedItem,
  getIsDirty,
  getIsFullscreenModeEnabled,
  getIsVizSettingsSidebarOpen,
} from "metabase/visualizer/selectors";
import {
  isDraggedWellItem,
  isValidDraggedItem,
} from "metabase/visualizer/utils";
import {
  closeVizSettingsSidebar,
  handleDrop,
  resetVisualizer,
  setDraggedItem,
  turnOffFullscreenMode,
} from "metabase/visualizer/visualizer.slice";
import type {
  DraggedItem,
  VisualizerHistoryItem,
} from "metabase-types/store/visualizer";

import { DataImporter } from "../DataImporter";
import { DataManager } from "../DataManager";
import { DragOverlay as VisualizerDragOverlay } from "../DragOverlay";
import { Footer } from "../Footer";
import { Header } from "../Header";
import { VisualizationCanvas } from "../VisualizationCanvas";
import { VizSettingsSidebar } from "../VizSettingsSidebar/VizSettingsSidebar";

import S from "./Visualizer.module.css";

const MEASURE_VERTICAL_ITEM = (node: HTMLElement) => {
  const rect = node.getBoundingClientRect();

  return new DOMRect(
    rect.x + (rect.width - rect.height) / 2,
    rect.y + (rect.height - rect.width) / 2,
    rect.height,
    rect.width,
  );
};

const MEASURE_HORIZONTAL_ITEM = (node: HTMLElement) => {
  return node.getBoundingClientRect();
};

const isVerticalDraggedItem = (draggedItem: DraggedItem | null) => {
  return (
    draggedItem &&
    isDraggedWellItem(draggedItem) &&
    draggedItem.data.current.wellId === DROPPABLE_ID.Y_AXIS_WELL
  );
};

interface VisualizerProps {
  className?: string;
  onSave?: (visualization: VisualizerHistoryItem) => void;
  saveLabel?: string;
  allowSaveWhenPristine?: boolean;
}

export const Visualizer = (props: VisualizerProps) => {
  const { className, onSave, saveLabel, allowSaveWhenPristine } = props;
  const { canUndo, canRedo, undo, redo } = useVisualizerHistory();

  const draggedItem = useSelector(getDraggedItem);
  const isFullscreen = useSelector(getIsFullscreenModeEnabled);
  const isVizSettingsSidebarOpen = useSelector(getIsVizSettingsSidebarOpen);

  const isDirty = useSelector(getIsDirty);
  const wasDirty = usePrevious(isDirty);

  const dispatch = useDispatch();

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

  useEffect(() => {
    const keyPress = (event: KeyboardEvent) => {
      if (event.key !== "z" && event.key !== "Z") {
        return;
      }

      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        if (event.shiftKey) {
          if (canRedo) {
            redo();
          }
        } else if (canUndo) {
          undo();
        }
      }
    };

    window.addEventListener("keydown", keyPress);

    return () => {
      window.removeEventListener("keydown", keyPress);
    };
  }, [canUndo, canRedo, undo, redo]);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      if (isValidDraggedItem(event.active)) {
        dispatch(
          setDraggedItem({
            id: event.active.id,
            data: {
              current: event.active.data.current,
            },
          } as DraggedItem),
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

  const classNames = [
    S.Container,
    isFullscreen ? S.fullscreen : undefined,
    isVizSettingsSidebarOpen ? S.vizSettingsOpen : undefined,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const [dataImporterOpen, handlers] = useDisclosure(false);

  return (
    <DndContext
      sensors={[canvasSensor]}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      measuring={{
        draggable: {
          measure: isVerticalDraggedItem(draggedItem)
            ? MEASURE_VERTICAL_ITEM
            : MEASURE_HORIZONTAL_ITEM,
        },
      }}
    >
      {/* main container */}
      <Box className={classNames}>
        {/* left side bar */}
        <Box className={S.dataSidebar}>
          {dataImporterOpen ? (
            <Flex direction="column" miw={320} h="100%">
              <Box p="md" h="91%">
                <Flex align="center">
                  <Title order={4} mb="xs">{t`Add data`}</Title>
                  <Button
                    size="xs"
                    variant="transparent"
                    ml="auto"
                    onClick={() => handlers.toggle()}
                  >{t`Done`}</Button>
                </Flex>
                <DataImporter />
              </Box>
              <Flex
                bg="white"
                p="md"
                align="center"
                justify="center"
                flex={1}
                style={{
                  borderTop: "1px solid var(--mb-color-border)",
                  cursor: "pointer",
                }}
              >
                <div onClick={() => handlers.toggle()}>Adjust columns</div>
                <Icon name="chevrondown" />
              </Flex>
            </Flex>
          ) : (
            <Flex direction="column" miw={320} p="md" h="100%">
              <Flex align="center">
                <Box px={12} py={8}>
                  <Title order={4}>{t`Manage data`}</Title>
                </Box>

                <Button
                  variant="transparent"
                  leftSection={<Icon name="add" />}
                  onClick={() => handlers.toggle()}
                  ml="auto"
                >
                  {t`Add more data`}
                </Button>
              </Flex>
              <DataManager />
            </Flex>
          )}
        </Box>

        {/* top header bar */}
        <Header
          onSave={onSave}
          saveLabel={saveLabel}
          allowSaveWhenPristine={allowSaveWhenPristine}
          className={S.Header}
        />

        {/* main area */}
        <VisualizationCanvas className={S.Canvas} />

        {/* footer */}
        <Footer className={S.Footer} />

        {/* right side bar */}
        <Box className={S.settingsSidebar}>
          <VizSettingsSidebar className={S.settingsSidebarContent} />
        </Box>

        <DragOverlay dropAnimation={null}>
          {draggedItem && <VisualizerDragOverlay item={draggedItem} />}
        </DragOverlay>
      </Box>
    </DndContext>
  );
};
