import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useSensor,
} from "@dnd-kit/core";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useUnmount } from "react-use";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { Box } from "metabase/ui";
import { DROPPABLE_ID } from "metabase/visualizer/constants";
import { useVisualizerHistory } from "metabase/visualizer/hooks/use-visualizer-history";
import { getDraggedItem } from "metabase/visualizer/selectors";
import {
  isDraggedWellItem,
  isValidDraggedItem,
} from "metabase/visualizer/utils";
import {
  handleDrop,
  resetVisualizer,
  setDraggedItem,
} from "metabase/visualizer/visualizer.slice";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import type {
  VisualizerColumnReference,
  VisualizerVizDefinition,
  Widget,
} from "metabase-types/api";
import type { DraggedItem } from "metabase-types/store/visualizer";

import { DataImporter } from "../DataImporter";
import { DragOverlay as VisualizerDragOverlay } from "../DragOverlay";
import { Footer } from "../Footer";
import { Header } from "../Header";
import { VisualizationCanvas } from "../VisualizationCanvas";
import { VisualizerUiProvider, useVisualizerUi } from "../VisualizerUiContext";
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
  onSave: (visualization: VisualizerVizDefinition) => void;
  onClose: () => void;
  saveLabel?: string;
  allowSaveWhenPristine?: boolean;
}

const VisualizerInner = (props: VisualizerProps) => {
  const { className, onSave, saveLabel, allowSaveWhenPristine, onClose } =
    props;

  const { canUndo, canRedo, undo, redo } = useVisualizerHistory();
  const {
    isDataSidebarOpen,
    isVizSettingsSidebarOpen,
    setVizSettingsSidebarOpen,
  } = useVisualizerUi();

  const [currentWidget, setCurrentWidget] = useState<Widget | null>(null);

  const onShowWidget = useCallback((widget: Widget | null) => {
    setCurrentWidget(widget);
  }, []);

  const onColumnClick = useCallback(
    (column: VisualizerColumnReference) => {
      setVizSettingsSidebarOpen(true);
      onShowWidget({
        id: "column_settings",
        props: { initialKey: getColumnKey(column) },
      });
    },
    [onShowWidget, setVizSettingsSidebarOpen],
  );

  const onSeriesClick = useCallback(
    (seriesKey: string) => {
      setVizSettingsSidebarOpen(true);
      onShowWidget({
        id: seriesKey,
        props: { seriesKey },
      });
    },
    [onShowWidget, setVizSettingsSidebarOpen],
  );

  const draggedItem = useSelector(getDraggedItem);
  const dispatch = useDispatch();

  const canvasSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 10 },
  });

  useUnmount(() => {
    dispatch(resetVisualizer());
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
    isDataSidebarOpen ? S.dataSidebarOpen : undefined,
    isVizSettingsSidebarOpen ? S.vizSettingsOpen : undefined,
    className,
  ]
    .filter(Boolean)
    .join(" ");

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
          <DataImporter className={S.dataSidebarContent} />
        </Box>

        {/* top header bar */}
        <Header
          onSave={onSave}
          onClose={onClose}
          saveLabel={saveLabel}
          allowSaveWhenPristine={allowSaveWhenPristine}
          className={S.Header}
        />

        {/* main area */}
        <VisualizationCanvas
          className={S.Canvas}
          onColumnClick={onColumnClick}
          onSeriesClick={onSeriesClick}
        />

        {/* footer */}
        <Footer className={S.Footer} />

        {/* right side bar */}
        <Box className={S.settingsSidebar}>
          <VizSettingsSidebar
            className={S.settingsSidebarContent}
            onShowWidget={onShowWidget}
            currentWidget={currentWidget}
          />
        </Box>

        {createPortal(
          <DragOverlay dropAnimation={null}>
            {draggedItem && <VisualizerDragOverlay item={draggedItem} />}
          </DragOverlay>,
          document.body,
        )}
      </Box>
    </DndContext>
  );
};

export const Visualizer = ({ ...props }: VisualizerProps) => {
  return (
    <VisualizerUiProvider>
      <VisualizerInner {...props} />
    </VisualizerUiProvider>
  );
};
