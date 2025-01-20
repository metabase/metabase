import {
  DndContext,
  type DndContextProps,
  type DragEndEvent,
  PointerSensor,
  useSensor,
} from "@dnd-kit/core";
import { restrictToParentElement } from "@dnd-kit/modifiers";
import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMergedRef } from "@mantine/hooks";
import { type Ref, forwardRef, useCallback, useMemo } from "react";

import type { UpdateQueryHookProps } from "metabase/query_builder/hooks/types";
import { getAggregationItems } from "metabase/query_builder/utils/get-aggregation-items";
import { Group, type GroupProps } from "metabase/ui";
import * as Lib from "metabase-lib";

import { AddAggregationButton } from "../AddAggregationButton";
import { AggregationItem } from "../AggregationItem";

type SummarizeAggregationItemListProps = UpdateQueryHookProps & GroupProps;

export const SummarizeAggregationItemList = ({
  query,
  onQueryChange,
  stageIndex,
  ...containerProps
}: SummarizeAggregationItemListProps) => {
  const aggregationItems = useMemo(
    () => getAggregationItems({ query, stageIndex }),
    [query, stageIndex],
  );

  const handleRemove = (aggregation: Lib.AggregationClause) => {
    const nextQuery = Lib.removeClause(query, stageIndex, aggregation);
    onQueryChange(nextQuery);
  };

  const handleReorder = (
    sourceClause: Lib.AggregationClause,
    targetClause: Lib.AggregationClause,
  ) => {
    const nextQuery = Lib.swapClauses(
      query,
      stageIndex,
      sourceClause,
      targetClause,
    );

    onQueryChange(nextQuery);
  };

  return (
    <Group
      data-testid="summarize-aggregation-item-list"
      spacing="sm"
      align="flex-start"
      {...containerProps}
    >
      <SummarizeAggregationDnDContext
        items={aggregationItems}
        onReorder={handleReorder}
      >
        {aggregationItems.map(
          (
            { aggregation, displayName, aggregationIndex, operators },
            index,
          ) => (
            <SummarizeAggregationDnDItem index={index} key={aggregationIndex}>
              <AggregationItem
                query={query}
                stageIndex={stageIndex}
                aggregation={aggregation}
                aggregationIndex={aggregationIndex}
                onQueryChange={onQueryChange}
                displayName={displayName}
                onAggregationRemove={() => handleRemove(aggregation)}
                operators={operators}
              />
            </SummarizeAggregationDnDItem>
          ),
        )}
      </SummarizeAggregationDnDContext>
      <AddAggregationButton
        query={query}
        stageIndex={stageIndex}
        onQueryChange={onQueryChange}
      />
    </Group>
  );
};

const SummarizeAggregationDnDItem = forwardRef(
  function SummarizeAggregationDndItem(
    { index, readOnly, children }: any,
    ref: Ref<HTMLDivElement>,
  ) {
    const { attributes, listeners, setNodeRef, transform, transition } =
      useSortable({
        id: getItemIdFromIndex(index),
        disabled: readOnly,
      });

    const mergedRef = useMergedRef(ref, setNodeRef);

    return (
      <div
        ref={mergedRef}
        {...attributes}
        {...listeners}
        style={{
          transition,
          transform: CSS.Translate.toString(transform),
        }}
      >
        {children}
      </div>
    );
  },
);

// dnd-kit ignores `0` item, so we convert indexes to string `"0"`
function getItemIdFromIndex(index: number) {
  return String(index);
}

function getItemIndexFromId(id: string | number) {
  return Number(id);
}

function SummarizeAggregationDnDContext({ items, children, onReorder }: any) {
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 15 },
  });

  const handleSortEnd: DndContextProps["onDragEnd"] = useCallback(
    (input: DragEndEvent) => {
      if (input.over) {
        const sourceIndex = getItemIndexFromId(input.active.id);
        const targetIndex = getItemIndexFromId(input.over.id);

        onReorder(
          items[sourceIndex].aggregation,
          items[targetIndex].aggregation,
        );
      }
    },
    [items, onReorder],
  );

  return (
    <DndContext
      sensors={[pointerSensor]}
      modifiers={[restrictToParentElement]}
      onDragEnd={handleSortEnd}
    >
      <SortableContext
        items={items.map((_, index) => getItemIdFromIndex(index))}
      >
        {children}
      </SortableContext>
    </DndContext>
  );
}
