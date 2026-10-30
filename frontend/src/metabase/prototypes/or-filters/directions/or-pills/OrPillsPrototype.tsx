import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Fragment, type ReactNode, useState } from "react";
import { t } from "ttag";

import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import {
  NotebookCell,
  NotebookCellAdd,
} from "metabase/querying/notebook/components/NotebookCell";
import { Box, Button, Group, Icon, Popover, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import { getFilterLabel } from "../../harness/clauses";
import type { FilterUiProps, FilterUiVariant } from "../../types";

import { GroupEditor, getOperatorLabel } from "./GroupEditor";
import { Token } from "./Token";
import S from "./Token.module.css";
import {
  BAR_DROP_ID,
  type DragSource,
  DraggableToken,
  applyDrop,
  collisionDetection,
  getPillId,
  parseDndId,
  usePointerOnPill,
} from "./dnd";
import {
  type PillTree,
  expandPillTree,
  flattenPillTree,
  getClause,
  moveRow,
  readPillTree,
  toPillClause,
  writePillTree,
} from "./orPills";

type OpenPill = { filterIndex: number; draft: PillTree };

/**
 * Direction A: top-level filters stay AND-ed pills, as today. A pill can hold
 * OR rows, edited in the group-editor dropdown. Drop a pill on another to OR
 * them; drag pills and conditions in and out of the open dropdown, and drag
 * its rows to reorder them.
 */
export function OrPillsPrototype({
  query,
  stageIndex,
  variant,
  onChange,
}: FilterUiProps) {
  const filters = Lib.filters(query, stageIndex);
  const [openPill, setOpenPill] = useState<OpenPill>();
  const [dragSource, setDragSource] = useState<DragSource>();
  const isPointerOnPill = usePointerOnPill();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const trees = filters.map((filter, index) =>
    index === openPill?.filterIndex
      ? openPill.draft
      : readPillTree(query, stageIndex, filter),
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setDragSource(undefined);
    const source = parseDndId(active.id);
    const target = over ? parseDndId(over.id) : undefined;
    if (!source || !target) {
      return;
    }
    if (source.kind === "row") {
      if (target.kind === "row" && openPill) {
        setOpenPill({
          ...openPill,
          draft: moveRow(openPill.draft, source.rowIndex, target.rowIndex),
        });
      }
      return;
    }
    if (source.kind !== "pill" && source.kind !== "token") {
      return;
    }

    const result = applyDrop(trees, openPill?.filterIndex, source, target);
    if (!result) {
      return;
    }
    if (result.isDraftOnly && openPill) {
      setOpenPill({
        ...openPill,
        draft: result.trees[openPill.filterIndex],
      });
      return;
    }

    const written = filters.reduce(
      (nextQuery, filter, index) =>
        result.trees[index] === trees[index]
          ? nextQuery
          : writePillTree(nextQuery, stageIndex, filter, result.trees[index]),
      query,
    );
    const addedClause = result.added && toPillClause(result.added);
    onChange(
      addedClause ? Lib.filter(written, stageIndex, addedClause) : written,
    );

    if (openPill) {
      const isKept = (index: number) =>
        toPillClause(result.trees[index]) !== undefined;
      const draft = result.trees[openPill.filterIndex];
      const removedBefore = filters
        .slice(0, openPill.filterIndex)
        .filter((_filter, index) => !isKept(index)).length;
      setOpenPill(
        isKept(openPill.filterIndex)
          ? { filterIndex: openPill.filterIndex - removedBefore, draft }
          : undefined,
      );
    }
  };

  const pills = filters.map((filter, index) => (
    <Pill
      key={index}
      query={query}
      stageIndex={stageIndex}
      filterIndex={index}
      tree={trees[index]}
      isOpened={index === openPill?.filterIndex}
      onToggle={() =>
        setOpenPill(
          index === openPill?.filterIndex
            ? undefined
            : { filterIndex: index, draft: trees[index] },
        )
      }
      onClose={() => {
        if (!isPointerOnPill()) {
          setOpenPill(undefined);
        }
      }}
      onDraftChange={(draft) => setOpenPill({ filterIndex: index, draft })}
      onUpdate={(tree) => {
        setOpenPill(undefined);
        onChange(writePillTree(query, stageIndex, filter, tree));
      }}
      onExpand={(tree) => {
        setOpenPill(undefined);
        onChange(expandPillTree(query, stageIndex, filter, tree));
      }}
      onRemove={() => {
        setOpenPill(undefined);
        onChange(Lib.removeClause(query, stageIndex, filter));
      }}
    />
  ));

  const addButton = (
    <AddFilterPopover
      query={query}
      stageIndex={stageIndex}
      variant={variant}
      isFirst={filters.length === 0}
      onAdd={(filterable) =>
        onChange(Lib.filter(query, stageIndex, filterable))
      }
    />
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={({ active }) => {
        const source = parseDndId(active.id);
        setDragSource(
          source?.kind === "pill" || source?.kind === "token"
            ? source
            : undefined,
        );
      }}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragSource(undefined)}
    >
      <FilterBar
        variant={variant}
        showsPlaceholder={dragSource?.kind === "token"}
      >
        {pills}
        {addButton}
      </FilterBar>
      <DragOverlay zIndex={1000} dropAnimation={null}>
        {dragSource && (
          <DragPreview
            query={query}
            stageIndex={stageIndex}
            source={dragSource}
            trees={trees}
            openIndex={openPill?.filterIndex}
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}

type FilterBarProps = {
  variant: FilterUiVariant;
  showsPlaceholder: boolean;
  children: [ReactNode, ReactNode];
};

/**
 * The pills plus the add button. Must render inside the DndContext to
 * register as a drop target: a condition dragged out of the editor lands
 * here as its own AND-ed pill.
 */
function FilterBar({ variant, showsPlaceholder, children }: FilterBarProps) {
  const { setNodeRef, isOver } = useDroppable({ id: BAR_DROP_ID });
  const [pills, addButton] = children;
  const placeholder = isOver && showsPlaceholder && (
    <Box className={S.placeholder} />
  );

  return (
    <Box ref={setNodeRef}>
      {variant === "chill" ? (
        <Group gap="sm" align="center">
          {pills}
          {placeholder}
          {addButton}
        </Group>
      ) : (
        <NotebookCell color="core-filter">
          {pills}
          {placeholder}
          {addButton}
        </NotebookCell>
      )}
    </Box>
  );
}

type DragPreviewProps = {
  query: Lib.Query;
  stageIndex: number;
  source: DragSource;
  trees: PillTree[];
  openIndex: number | undefined;
};

function DragPreview({
  query,
  stageIndex,
  source,
  trees,
  openIndex,
}: DragPreviewProps) {
  const clause =
    source.kind === "token" && openIndex !== undefined
      ? getClause(trees[openIndex], source.path)
      : undefined;
  const tree = source.kind === "pill" ? trees[source.filterIndex] : undefined;

  return (
    <Box
      className={S.overlay}
      display="inline-flex"
      style={{ borderRadius: "2rem" }}
    >
      <Token onClick={() => undefined} onRemove={() => undefined}>
        {tree && (
          <PillLabel query={query} stageIndex={stageIndex} tree={tree} />
        )}
        {clause && getFilterLabel(query, stageIndex, clause)}
      </Token>
    </Box>
  );
}

type PillProps = {
  query: Lib.Query;
  stageIndex: number;
  filterIndex: number;
  tree: PillTree;
  isOpened: boolean;
  onToggle: () => void;
  onClose: () => void;
  onDraftChange: (tree: PillTree) => void;
  onUpdate: (tree: PillTree) => void;
  onExpand: (tree: PillTree) => void;
  onRemove: () => void;
};

function Pill({
  query,
  stageIndex,
  filterIndex,
  tree,
  isOpened,
  onToggle,
  onClose,
  onDraftChange,
  onUpdate,
  onExpand,
  onRemove,
}: PillProps) {
  return (
    <Popover
      opened={isOpened}
      position="bottom-start"
      transitionProps={{ duration: 0 }}
      onChange={(opened) => {
        if (!opened) {
          onClose();
        }
      }}
    >
      <Popover.Target>
        <DraggableToken
          dndId={getPillId(filterIndex)}
          isDroppable
          onClick={onToggle}
          onRemove={onRemove}
        >
          <PillLabel query={query} stageIndex={stageIndex} tree={tree} />
        </DraggableToken>
      </Popover.Target>
      {/* The editor's own pickers render inside this dropdown, so it must not clip them. */}
      <Popover.Dropdown p={0} style={{ overflow: "visible" }}>
        <GroupEditor
          query={query}
          stageIndex={stageIndex}
          tree={tree}
          onChange={onDraftChange}
          onUpdate={onUpdate}
          onExpand={onExpand}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

type PillLabelProps = {
  query: Lib.Query;
  stageIndex: number;
  tree: PillTree;
};

const MAX_FULL_LABEL_CLAUSES = 2;

/**
 * Figma "Group token (collapsed)": up to two conditions are spelled out;
 * three or more collapse to the first condition and `and|or N more`.
 */
function PillLabel({ query, stageIndex, tree }: PillLabelProps) {
  const parts = flattenPillTree(tree).map(({ connector, clause }) => ({
    connector: getOperatorLabel(connector),
    label: getFilterLabel(query, stageIndex, clause),
  }));
  const [first, ...rest] = parts;
  if (!first) {
    return null;
  }

  const isSummarized = parts.length > MAX_FULL_LABEL_CLAUSES;
  const tail = isSummarized
    ? [{ connector: rest[0].connector, label: t`${rest.length} more` }]
    : rest;

  return (
    <>
      {first.label}
      {tail.map(({ connector, label }, index) => (
        <Fragment key={index}>
          <Text span inherit fw="normal" c="text-secondary">
            {connector}
          </Text>
          {label}
        </Fragment>
      ))}
    </>
  );
}

type AddFilterPopoverProps = {
  query: Lib.Query;
  stageIndex: number;
  variant: FilterUiVariant;
  isFirst: boolean;
  onAdd: (filterable: Lib.Filterable) => void;
};

function AddFilterPopover({
  query,
  stageIndex,
  variant,
  isFirst,
  onAdd,
}: AddFilterPopoverProps) {
  const [isOpened, setIsOpened] = useState(false);

  return (
    <Popover
      opened={isOpened}
      position="bottom-start"
      transitionProps={{ duration: 0 }}
      onChange={setIsOpened}
    >
      <Popover.Target>
        {variant === "chill" ? (
          <Group gap="sm">
            <Button
              size="compact-sm"
              variant="subtle"
              leftSection={isFirst ? <Icon name="add" /> : undefined}
              onClick={() => setIsOpened((opened) => !opened)}
            >
              {isFirst ? t`Add filter` : t`AND`}
            </Button>
          </Group>
        ) : (
          <NotebookCellAdd
            color="core-filter"
            initialAddText={
              isFirst ? t`Add filters to narrow your answer` : undefined
            }
            onClick={() => setIsOpened((opened) => !opened)}
          />
        )}
      </Popover.Target>
      <Popover.Dropdown>
        <FilterPicker
          query={query}
          stageIndex={stageIndex}
          onSelect={(filterable) => {
            onAdd(filterable);
            setIsOpened(false);
          }}
          onClose={() => setIsOpened(false)}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
