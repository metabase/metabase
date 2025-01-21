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
import {
  type ChangeEvent,
  type Ref,
  forwardRef,
  useCallback,
  useMemo,
  useState,
} from "react";
import { t } from "ttag";

import Input from "metabase/core/components/Input";
import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import {
  type UpdateQueryHookProps,
  useBreakoutQueryHandlers,
} from "metabase/query_builder/hooks";
import { Box, DelayGroup } from "metabase/ui";
import * as Lib from "metabase-lib";

import BreakoutColumnListS from "./BreakoutColumnList.module.css";
import { BreakoutColumnListItem } from "./BreakoutColumnListItem";
import { getBreakoutListItem, getColumnSections, isPinnedColumn } from "./util";

export type BreakoutColumnListProps = UpdateQueryHookProps;

export function BreakoutColumnList({
  query,
  onQueryChange,
  stageIndex = -1,
}: BreakoutColumnListProps) {
  const {
    onAddBreakout,
    onUpdateBreakout,
    onRemoveBreakout,
    onReplaceBreakouts,
  } = useBreakoutQueryHandlers({ query, onQueryChange, stageIndex });

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebouncedValue(
    searchQuery,
    SEARCH_DEBOUNCE_DURATION,
  );
  const isSearching = searchQuery.trim().length > 0;

  const breakouts = Lib.breakouts(query, stageIndex);

  const [pinnedItemCount, setPinnedItemCount] = useState(breakouts.length);

  const pinnedItems = useMemo(
    () =>
      breakouts
        .slice(0, pinnedItemCount)
        .map(breakout => getBreakoutListItem(query, stageIndex, breakout)),
    [query, stageIndex, breakouts, pinnedItemCount],
  );

  const allColumns = useMemo(
    () => Lib.breakoutableColumns(query, stageIndex),
    [query, stageIndex],
  );

  const unpinnedColumns = useMemo(
    () =>
      allColumns.filter(
        column => !isPinnedColumn(query, stageIndex, column, pinnedItemCount),
      ),
    [query, stageIndex, allColumns, pinnedItemCount],
  );

  const sections = useMemo(
    () =>
      getColumnSections(
        query,
        stageIndex,
        isSearching ? allColumns : unpinnedColumns,
        debouncedSearchQuery,
      ),
    [
      query,
      stageIndex,
      allColumns,
      unpinnedColumns,
      isSearching,
      debouncedSearchQuery,
    ],
  );

  const handleRemovePinnedBreakout = useCallback(
    (breakout: Lib.BreakoutClause) => {
      setPinnedItemCount(pinnedItemCount - 1);
      onRemoveBreakout(breakout);
    },
    [pinnedItemCount, onRemoveBreakout],
  );

  const handleReplaceBreakouts = useCallback(
    (column: Lib.ColumnMetadata) => {
      onReplaceBreakouts(column);
      setPinnedItemCount(0);
    },
    [onReplaceBreakouts],
  );

  const handleChangeSearchQuery = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(event.target.value);
    },
    [],
  );

  const handleResetSearch = useCallback(() => setSearchQuery(""), []);
  const handleReorderBreakout = (
    sourceClause: Lib.BreakoutClause,
    targetClause: Lib.BreakoutClause,
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
    <>
      <Box mb="md">
        <Input
          fullWidth
          placeholder={t`Find...`}
          value={searchQuery}
          leftIcon="search"
          onResetClick={handleResetSearch}
          onChange={handleChangeSearchQuery}
        />
      </Box>
      {!isSearching && (
        <DelayGroup>
          <ul data-testid="pinned-dimensions">
            <BreakoutDnDContext
              items={pinnedItems}
              onReorder={handleReorderBreakout}
            >
              {pinnedItems.map((item, itemIndex) => (
                <BreakoutDnDItem index={itemIndex} key={itemIndex}>
                  <BreakoutColumnListItem
                    key={itemIndex}
                    query={query}
                    stageIndex={stageIndex}
                    item={item}
                    breakout={item.breakout}
                    isPinned
                    onAddBreakout={onAddBreakout}
                    onUpdateBreakout={onUpdateBreakout}
                    onRemoveBreakout={handleRemovePinnedBreakout}
                  />
                </BreakoutDnDItem>
              ))}
            </BreakoutDnDContext>
          </ul>
        </DelayGroup>
      )}
      <DelayGroup>
        <ul data-testid="unpinned-dimensions">
          {sections.map(section => (
            <li key={section.name}>
              <Box className={BreakoutColumnListS.ColumnGroupName}>
                {section.name}
              </Box>
              <ul>
                <BreakoutDnDContext
                  items={section.items}
                  onReorder={handleReorderBreakout}
                >
                  {section.items.map((item, itemIndex) => (
                    <BreakoutDnDItem index={itemIndex} key={itemIndex}>
                      <BreakoutColumnListItem
                        key={itemIndex}
                        query={query}
                        stageIndex={stageIndex}
                        item={item}
                        breakout={item.breakout}
                        onAddBreakout={onAddBreakout}
                        onUpdateBreakout={onUpdateBreakout}
                        onRemoveBreakout={onRemoveBreakout}
                        onReplaceBreakouts={handleReplaceBreakouts}
                      />
                    </BreakoutDnDItem>
                  ))}
                </BreakoutDnDContext>
              </ul>
            </li>
          ))}
        </ul>
      </DelayGroup>
    </>
  );
}

function BreakoutDnDContext({ items, children, onReorder }: any) {
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 15 },
  });

  const handleSortEnd: DndContextProps["onDragEnd"] = useCallback(
    (input: DragEndEvent) => {
      if (input.over) {
        const sourceIndex = getItemIndexFromId(input.active.id);
        const targetIndex = getItemIndexFromId(input.over.id);

        onReorder(items[sourceIndex].breakout, items[targetIndex].breakout);
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

// dnd-kit ignores `0` item, so we convert indexes to string `"0"`
function getItemIdFromIndex(index: number) {
  return String(index);
}

function getItemIndexFromId(id: string | number) {
  return Number(id);
}

const BreakoutDnDItem = forwardRef(function BreakoutDnDItem(
  { index, readOnly, children }: any,
  ref: Ref<HTMLDivElement>,
) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id: getItemIdFromIndex(index),
      disabled: readOnly,
      // disable animation after reordering because we don't have stable item ids
      animateLayoutChanges: () => false,
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
});
