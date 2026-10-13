import {
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  pointerWithin,
  useSensor,
} from "@dnd-kit/core";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "ttag";

import { Box, Stack, Text } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { BlockInspector } from "./BlockInspector";
import { CanvasGrid } from "./CanvasGrid";
import { CanvasToolbar } from "./CanvasToolbar";
import S from "./SummaryCanvas.module.css";
import { SummaryFieldList } from "./SummaryFieldList";
import {
  createBlock,
  createBlockFromItem,
  dropOnBlock,
  dropOnWell,
  duplicateBlock,
  updateBlockLayouts,
} from "./blocks";
import {
  getSummaryCanvas,
  setSummaryCanvas,
  updateSummaryCanvas,
  useSummaryCanvas,
} from "./canvas-store";
import { getGrownLayout } from "./layout";
import type {
  SummaryBlock,
  SummaryCanvasState,
  SummaryDragItem,
  SummaryDropTarget,
} from "./types";
import { getSummaryBase, getSummaryKey, isSummaryDragItem } from "./utils";

const DROP_TARGET_PRIORITY: Record<SummaryDropTarget["type"], number> = {
  well: 0,
  block: 1,
  canvas: 2,
};

function getDropTarget(data: unknown): SummaryDropTarget | null {
  if (typeof data !== "object" || data == null || !("target" in data)) {
    return null;
  }
  const { target } = data;
  if (typeof target !== "object" || target == null || !("type" in target)) {
    return null;
  }
  if (target.type === "canvas") {
    return { type: "canvas" };
  }
  if (target.type === "block" && "blockId" in target) {
    return typeof target.blockId === "string"
      ? { type: "block", blockId: target.blockId }
      : null;
  }
  if (target.type === "well" && "wellId" in target) {
    const { wellId } = target;
    return wellId === "rows" || wellId === "columns" || wellId === "values"
      ? { type: "well", wellId }
      : null;
  }
  return null;
}

function getDropTargetPriority(data: unknown): number {
  const target = getDropTarget(data);
  return target ? DROP_TARGET_PRIORITY[target.type] : Infinity;
}

/** Drop targets nest (a block sits on the canvas), so the innermost one wins. */
const collisionDetection: CollisionDetection = (args) =>
  pointerWithin(args).sort((a, b) => {
    const containerA = args.droppableContainers.find(({ id }) => id === a.id);
    const containerB = args.droppableContainers.find(({ id }) => id === b.id);
    return (
      getDropTargetPriority(containerA?.data.current) -
      getDropTargetPriority(containerB?.data.current)
    );
  });

type SummaryCanvasProps = {
  question: Question;
  onShowData: () => void;
};

/**
 * The summaries tab: several independent summaries of the data tab's table, side by side on a
 * grid. Each summary builds on the data tab's latest query, so its filters and custom columns
 * apply everywhere; a summary can add filters of its own.
 */
export function SummaryCanvas({ question, onShowData }: SummaryCanvasProps) {
  const summaryKey = getSummaryKey(question);
  const canvas = useSummaryCanvas(summaryKey);
  const base = useMemo(() => getSummaryBase(question.query()), [question]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [draggedItem, setDraggedItem] = useState<SummaryDragItem | null>(null);
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  });

  useEffect(() => {
    if (summaryKey != null && getSummaryCanvas(summaryKey) == null) {
      const block = createBlock(base, []);
      setSummaryCanvas(summaryKey, {
        blocks: [block],
        selectedBlockId: block.id,
        dashboard: null,
        removedCardIds: [],
      });
    }
  }, [summaryKey, base]);

  if (summaryKey == null || canvas == null) {
    return null;
  }

  const updateCanvas = (
    updater: (canvas: SummaryCanvasState) => SummaryCanvasState,
  ) => updateSummaryCanvas(summaryKey, updater);

  const updateBlock = (
    blockId: string,
    updater: (block: SummaryBlock) => SummaryBlock,
  ) =>
    updateCanvas((canvas) => ({
      ...canvas,
      blocks: canvas.blocks.map((block) => {
        if (block.id !== blockId) {
          return block;
        }
        const nextBlock = updater(block);
        return { ...nextBlock, layout: getGrownLayout(block, nextBlock) };
      }),
    }));

  const addBlock = (block: SummaryBlock) =>
    updateCanvas((canvas) => ({
      ...canvas,
      blocks: [...canvas.blocks, block],
      selectedBlockId: block.id,
    }));

  const selectBlock = (blockId: string | null) =>
    updateCanvas((canvas) =>
      canvas.selectedBlockId === blockId
        ? canvas
        : { ...canvas, selectedBlockId: blockId },
    );

  const handleAddBlock = () => addBlock(createBlock(base, canvas.blocks));

  const handleDuplicateBlock = (blockId: string) => {
    const block = canvas.blocks.find(({ id }) => id === blockId);
    if (block) {
      addBlock(duplicateBlock(block, canvas.blocks));
    }
  };

  const handleRemoveBlock = (blockId: string) =>
    updateCanvas((canvas) => {
      const cardId = canvas.blocks.find(({ id }) => id === blockId)?.cardId;
      return {
        ...canvas,
        blocks: canvas.blocks.filter(({ id }) => id !== blockId),
        selectedBlockId:
          canvas.selectedBlockId === blockId ? null : canvas.selectedBlockId,
        removedCardIds:
          cardId != null
            ? [...canvas.removedCardIds, cardId]
            : canvas.removedCardIds,
      };
    });

  const selectedBlock = canvas.blocks.find(
    ({ id }) => id === canvas.selectedBlockId,
  );

  const handleAddItem = (item: SummaryDragItem) => {
    if (selectedBlock) {
      updateBlock(selectedBlock.id, (block) => dropOnBlock(base, block, item));
      return;
    }
    const block = createBlockFromItem(base, canvas.blocks, item);
    if (block) {
      addBlock(block);
    }
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    const data: unknown = active.data.current;
    setDraggedItem(isSummaryDragItem(data) ? data : null);
  };

  const handleDragEnd = ({ over }: DragEndEvent) => {
    const target = getDropTarget(over?.data.current);
    const item = draggedItem;
    setDraggedItem(null);
    if (item == null || target == null) {
      return;
    }
    switch (target.type) {
      case "well":
        if (selectedBlock) {
          updateBlock(selectedBlock.id, (block) =>
            dropOnWell(base, block, item, target.wellId),
          );
        }
        return;
      case "block":
        if (item.kind !== "chip") {
          updateBlock(target.blockId, (block) =>
            dropOnBlock(base, block, item),
          );
          selectBlock(target.blockId);
        }
        return;
      case "canvas": {
        const block = createBlockFromItem(base, canvas.blocks, item);
        if (block) {
          addBlock(block);
        }
        return;
      }
    }
  };

  return (
    <DndContext
      sensors={[pointerSensor]}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDraggedItem(null)}
    >
      <Box className={S.root} data-testid="summary-canvas">
        <Box className={S.main}>
          <CanvasToolbar
            dataQuestion={question}
            base={base}
            canvas={canvas}
            onAddBlock={handleAddBlock}
            onRefreshAll={() => setRefreshKey((key) => key + 1)}
            onShowData={onShowData}
            onSaved={(dashboard, cardIds, savedRemovedCardIds) =>
              updateCanvas((canvas) => ({
                ...canvas,
                dashboard,
                blocks: canvas.blocks.map((block) => ({
                  ...block,
                  cardId: cardIds.get(block.id) ?? block.cardId,
                })),
                removedCardIds: canvas.removedCardIds.filter(
                  (cardId) => !savedRemovedCardIds.includes(cardId),
                ),
              }))
            }
            onDashboardMissing={() =>
              updateCanvas((canvas) => ({
                ...canvas,
                dashboard: null,
                removedCardIds: [],
                blocks: canvas.blocks.map((block) => ({
                  ...block,
                  cardId: null,
                })),
              }))
            }
          />
          <CanvasGrid
            dataQuestion={question}
            base={base}
            blocks={canvas.blocks}
            selectedBlockId={canvas.selectedBlockId}
            refreshKey={refreshKey}
            draggedItem={draggedItem}
            onLayoutChange={(layouts) =>
              updateCanvas((canvas) => {
                const blocks = updateBlockLayouts(canvas.blocks, layouts);
                return blocks.every(
                  (block, index) => block === canvas.blocks[index],
                )
                  ? canvas
                  : { ...canvas, blocks };
              })
            }
            onSelectBlock={selectBlock}
            onDuplicateBlock={handleDuplicateBlock}
            onRemoveBlock={handleRemoveBlock}
          />
        </Box>
        <Box className={S.sidebar} data-testid="summary-canvas-sidebar">
          <Box className={S.inspectorScroll}>
            {selectedBlock ? (
              <BlockInspector
                key={selectedBlock.id}
                base={base}
                block={selectedBlock}
                draggedItem={draggedItem}
                onChange={(updater) => updateBlock(selectedBlock.id, updater)}
                onClose={() => selectBlock(null)}
              />
            ) : (
              <Stack className={S.inspector} gap="xs">
                <Text fw="bold">{t`No summary selected`}</Text>
                <Text c="text-secondary">
                  {t`Click a summary to edit it. Drag a field onto the canvas, or click one, to start a new summary.`}
                </Text>
              </Stack>
            )}
          </Box>
          <SummaryFieldList base={base} onAddItem={handleAddItem} />
        </Box>
      </Box>
      {createPortal(
        <DragOverlay dropAnimation={null}>
          {draggedItem && (
            <Box className={S.dragPreview}>{draggedItem.label}</Box>
          )}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}
