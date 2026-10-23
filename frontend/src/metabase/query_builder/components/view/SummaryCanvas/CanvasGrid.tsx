import { useDroppable } from "@dnd-kit/core";
import cx from "classnames";
import { useMemo } from "react";
import ReactGridLayout, { type Layout } from "react-grid-layout";
import { t } from "ttag";

import { Box, Icon, Stack, Text } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { BLOCK_DRAG_HANDLE_CLASS, SummaryBlockCard } from "./SummaryBlockCard";
import S from "./SummaryCanvas.module.css";
import { CANVAS_COLUMNS } from "./layout";
import type {
  SummaryBase,
  SummaryBlock,
  SummaryBlockLayout,
  SummaryDragItem,
  SummaryDropTarget,
} from "./types";
import { useContainerWidth } from "./use-container-width";

const ROW_HEIGHT_PX = 40;
const GRID_MARGIN_PX: [number, number] = [12, 12];
const MIN_BLOCK_SIZE = { minW: 4, minH: 3 };

type CanvasGridProps = {
  dataQuestion: Question;
  base: SummaryBase;
  blocks: SummaryBlock[];
  selectedBlockId: string | null;
  refreshKey: number;
  draggedItem: SummaryDragItem | null;
  onLayoutChange: (layouts: Map<string, SummaryBlockLayout>) => void;
  onSelectBlock: (blockId: string | null) => void;
  onDuplicateBlock: (blockId: string) => void;
  onRemoveBlock: (blockId: string) => void;
};

/** Summaries laid out on a dashboard-like grid: drag a block's header to move it, its corner to resize. */
export function CanvasGrid({
  dataQuestion,
  base,
  blocks,
  selectedBlockId,
  refreshKey,
  draggedItem,
  onLayoutChange,
  onSelectBlock,
  onDuplicateBlock,
  onRemoveBlock,
}: CanvasGridProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: "summary-canvas",
    data: { target: { type: "canvas" } satisfies SummaryDropTarget },
  });
  const isDraggingField = draggedItem != null && draggedItem.kind !== "chip";
  const { ref: gridContainerRef, width: gridWidth } =
    useContainerWidth<HTMLDivElement>();

  const layout = useMemo(
    () =>
      blocks.map(
        (block): Layout => ({
          i: block.id,
          ...block.layout,
          ...MIN_BLOCK_SIZE,
        }),
      ),
    [blocks],
  );

  const handleLayoutChange = (nextLayout: Layout[]) => {
    onLayoutChange(
      new Map(
        nextLayout.map(({ i, x, y, w, h }) => [i, { x, y, w, h }] as const),
      ),
    );
  };

  return (
    <Box
      ref={setNodeRef}
      className={cx(S.canvas, {
        [S.canvasDropTarget]: isDraggingField && isOver,
      })}
      data-testid="summary-canvas-grid"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onSelectBlock(null);
        }
      }}
    >
      <Box ref={gridContainerRef}>
        {gridWidth > 0 && (
          <ReactGridLayout
            className={S.grid}
            width={gridWidth}
            layout={layout}
            cols={CANVAS_COLUMNS}
            rowHeight={ROW_HEIGHT_PX}
            margin={GRID_MARGIN_PX}
            containerPadding={[0, 0]}
            draggableHandle={`.${BLOCK_DRAG_HANDLE_CLASS}`}
            compactType="vertical"
            onLayoutChange={handleLayoutChange}
          >
            {blocks.map((block) => (
              <div key={block.id}>
                <SummaryBlockCard
                  dataQuestion={dataQuestion}
                  base={base}
                  block={block}
                  isSelected={block.id === selectedBlockId}
                  refreshKey={refreshKey}
                  draggedItem={draggedItem}
                  onSelect={() => onSelectBlock(block.id)}
                  onDuplicate={() => onDuplicateBlock(block.id)}
                  onRemove={() => onRemoveBlock(block.id)}
                />
              </div>
            ))}
          </ReactGridLayout>
        )}
      </Box>
      <Stack
        className={cx(S.canvasDropHint, {
          [S.canvasDropHintActive]: isDraggingField,
        })}
        align="center"
        gap="xs"
      >
        <Icon name="add" />
        <Text c="inherit">
          {blocks.length === 0
            ? t`Drop a column or metric here to start a summary`
            : t`Drop here for a new summary, or onto a summary to add to it`}
        </Text>
      </Stack>
    </Box>
  );
}
