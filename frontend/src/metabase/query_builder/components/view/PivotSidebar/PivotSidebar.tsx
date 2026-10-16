import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import cx from "classnames";
import { type ReactNode, useMemo, useState } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import { getColumnIcon } from "metabase/common/utils/columns";
import { AggregationPicker } from "metabase/querying/common/components/AggregationPicker";
import {
  Box,
  Button,
  Flex,
  Icon,
  Popover,
  Tabs,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { ExplorePill } from "../ExploreBar/ExplorePill";
import { useExploreUpdate } from "../ExploreBar/use-explore-update";
import { STAGE_INDEX, switchExploreView } from "../ExploreBar/utils";

import S from "./PivotSidebar.module.css";
import {
  type PivotBreakoutItem,
  type PivotFieldItem,
  type PivotWellId,
  addToWell,
  canDropOnWell,
  getDefaultWell,
  getPivotWells,
  moveBreakout,
  updatePivotQuery,
} from "./pivot-wells";

type PivotSidebarProps = {
  question: Question;
  onClose: () => void;
};

type DragItem =
  | { type: "field"; item: PivotFieldItem }
  | { type: "breakout"; name: string; label: string; wellId: PivotWellId };

function isDragItem(value: unknown): value is DragItem {
  return (
    typeof value === "object" &&
    value != null &&
    "type" in value &&
    (value.type === "field" || value.type === "breakout")
  );
}

function isWellId(value: unknown): value is PivotWellId {
  return value === "rows" || value === "columns" || value === "values";
}

/**
 * Summarize as a pivot: drag columns into Rows and Columns, and columns or metrics into
 * Values. It edits the same question the explore bar does, so both always agree.
 */
export function PivotSidebar({ question, onClose }: PivotSidebarProps) {
  const query = question.query();
  const updateExploreQuestion = useExploreUpdate();
  const wells = useMemo(() => getPivotWells(question), [question]);
  const [draggedItem, setDraggedItem] = useState<DragItem | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  useMount(() => {
    // summarizing means looking at a pivot; a chart's x-axis and series become its rows and columns
    const hasBreakouts = wells.rows.length + wells.columns.length > 0;
    if (hasBreakouts && question.display() !== "pivot") {
      updateExploreQuestion(question, switchExploreView(question, "pivot"));
    }
  });

  const commit = (nextQuestion: Question | null) => {
    if (nextQuestion) {
      updateExploreQuestion(question, nextQuestion);
    }
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    const data = active.data.current;
    setDraggedItem(isDragItem(data) ? data : null);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setDraggedItem(null);
    const data = active.data.current;
    const wellId = over?.data.current?.wellId;
    if (!isDragItem(data) || !isWellId(wellId)) {
      return;
    }
    if (data.type === "field") {
      commit(addToWell(question, wellId, data.item));
    } else if (wellId !== "values" && wellId !== data.wellId) {
      commit(moveBreakout(question, data.name, wellId));
    }
  };

  const handleClauseChange = (nextQuery: Lib.Query) =>
    commit(updatePivotQuery(question, nextQuery));

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDraggedItem(null)}
    >
      <Flex className={S.root} direction="column" data-testid="pivot-sidebar">
        <Flex className={S.header} align="center" justify="space-between">
          <Box>
            <Title order={4}>{t`Summarize`}</Title>
            <Text size="sm" c="text-secondary">
              {t`Drag columns and metrics into the pivot`}
            </Text>
          </Box>
          <Button size="sm" variant="filled" onClick={onClose}>
            {t`Done`}
          </Button>
        </Flex>

        <Box className={S.wells}>
          <BreakoutWell
            wellId="rows"
            title={t`Rows`}
            placeholder={t`Drop columns to group rows by`}
            items={wells.rows}
            draggedItem={draggedItem}
            query={query}
            onQueryChange={handleClauseChange}
          />
          <BreakoutWell
            wellId="columns"
            title={t`Columns`}
            placeholder={t`Drop columns to split across the top`}
            items={wells.columns}
            draggedItem={draggedItem}
            query={query}
            onQueryChange={handleClauseChange}
          />
          <Well
            wellId="values"
            title={t`Values`}
            placeholder={t`Drop numbers or metrics to calculate`}
            isEmpty={wells.values.length === 0}
            draggedItem={draggedItem}
            footer={
              <AddValueButton
                query={query}
                onQueryChange={handleClauseChange}
              />
            }
          >
            {wells.values.map((value) => (
              <ExplorePill
                key={value.index}
                pill={{
                  key: `aggregation:${value.index}`,
                  kind: "aggregation",
                  ...value,
                }}
                query={query}
                onQueryChange={handleClauseChange}
              />
            ))}
          </Well>
        </Box>

        <FieldList
          query={query}
          onAdd={(item) =>
            commit(addToWell(question, getDefaultWell(item), item))
          }
        />
      </Flex>
      <DragOverlay dropAnimation={null}>
        {draggedItem && (
          <Box className={S.dragOverlay}>
            {draggedItem.type === "field"
              ? draggedItem.item.label
              : draggedItem.label}
          </Box>
        )}
      </DragOverlay>
    </DndContext>
  );
}

type WellProps = {
  wellId: PivotWellId;
  title: string;
  placeholder: string;
  isEmpty: boolean;
  draggedItem: DragItem | null;
  children?: ReactNode;
  footer?: ReactNode;
};

function Well({
  wellId,
  title,
  placeholder,
  isEmpty,
  draggedItem,
  children,
  footer,
}: WellProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `pivot-well:${wellId}`,
    data: { wellId },
  });
  const canDrop =
    draggedItem != null &&
    (draggedItem.type === "field"
      ? canDropOnWell(draggedItem.item, wellId)
      : wellId !== "values");

  return (
    <Box>
      <Text className={S.wellTitle}>{title}</Text>
      <Flex
        ref={setNodeRef}
        className={cx(S.well, {
          [S.wellAcceptsDrop]: canDrop,
          [S.wellIsOver]: canDrop && isOver,
          [S.wellRejectsDrop]: draggedItem != null && !canDrop,
        })}
        gap="xs"
        wrap="wrap"
        align="center"
        data-testid={`pivot-well-${wellId}`}
      >
        {isEmpty ? (
          <Text className={S.wellPlaceholder}>{placeholder}</Text>
        ) : (
          children
        )}
        {footer}
      </Flex>
    </Box>
  );
}

type BreakoutWellProps = {
  wellId: "rows" | "columns";
  title: string;
  placeholder: string;
  items: PivotBreakoutItem[];
  draggedItem: DragItem | null;
  query: Lib.Query;
  onQueryChange: (query: Lib.Query) => void;
};

function BreakoutWell({
  wellId,
  title,
  placeholder,
  items,
  draggedItem,
  query,
  onQueryChange,
}: BreakoutWellProps) {
  return (
    <Well
      wellId={wellId}
      title={title}
      placeholder={placeholder}
      isEmpty={items.length === 0}
      draggedItem={draggedItem}
    >
      {items.map((item) => (
        <DraggableBreakout
          key={item.name}
          wellId={wellId}
          item={item}
          query={query}
          onQueryChange={onQueryChange}
        />
      ))}
    </Well>
  );
}

type DraggableBreakoutProps = {
  wellId: "rows" | "columns";
  item: PivotBreakoutItem;
  query: Lib.Query;
  onQueryChange: (query: Lib.Query) => void;
};

function DraggableBreakout({
  wellId,
  item,
  query,
  onQueryChange,
}: DraggableBreakoutProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pivot-breakout:${item.name}`,
    data: {
      type: "breakout",
      name: item.name,
      label: item.label,
      wellId,
    } satisfies DragItem,
  });

  return (
    <Box
      ref={setNodeRef}
      className={cx(S.draggable, { [S.isDragging]: isDragging })}
      {...attributes}
      {...listeners}
    >
      <ExplorePill
        pill={{
          key: `breakout:${item.index}`,
          kind: "breakout",
          clause: item.clause,
          index: item.index,
          label: item.label,
        }}
        query={query}
        onQueryChange={onQueryChange}
      />
    </Box>
  );
}

type AddValueButtonProps = {
  query: Lib.Query;
  onQueryChange: (query: Lib.Query) => void;
};

function AddValueButton({ query, onQueryChange }: AddValueButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Popover opened={isOpen} onChange={setIsOpen} position="bottom-start">
      <Popover.Target>
        <UnstyledButton
          className={S.addButton}
          aria-label={t`Add a value`}
          onClick={() => setIsOpen(!isOpen)}
        >
          <Icon name="add" size={12} />
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown>
        <AggregationPicker
          query={query}
          stageIndex={STAGE_INDEX}
          operators={Lib.availableAggregationOperators(query, STAGE_INDEX)}
          allowCustomExpressions
          allowMetrics
          onQueryChange={(nextQuery) => {
            onQueryChange(nextQuery);
            setIsOpen(false);
          }}
          onClose={() => setIsOpen(false)}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

type FieldListProps = {
  query: Lib.Query;
  onAdd: (item: PivotFieldItem) => void;
};

function FieldList({ query, onAdd }: FieldListProps) {
  const [tab, setTab] = useState<"columns" | "metrics">("columns");
  const [searchText, setSearchText] = useState("");
  const needle = searchText.trim().toLowerCase();

  const sections = useMemo(() => {
    const columns = Lib.breakoutableColumns(query, STAGE_INDEX).filter(
      (column) =>
        Lib.displayInfo(query, STAGE_INDEX, column)
          .displayName.toLowerCase()
          .includes(needle),
    );
    return Lib.groupColumns(columns).map((group) => ({
      name: Lib.displayInfo(query, STAGE_INDEX, group).displayName,
      columns: Lib.getColumnsFromColumnGroup(group),
    }));
  }, [query, needle]);

  const metrics = useMemo(
    () =>
      [
        ...Lib.availableMetrics(query, STAGE_INDEX).map(
          (metric): PivotFieldItem => ({
            kind: "metric",
            metric,
            label: Lib.displayInfo(query, STAGE_INDEX, metric).displayName,
          }),
        ),
        ...Lib.availableMeasures(query, STAGE_INDEX).map(
          (measure): PivotFieldItem => ({
            kind: "metric",
            metric: measure,
            label: Lib.displayInfo(query, STAGE_INDEX, measure).displayName,
          }),
        ),
      ].filter((item) => item.label.toLowerCase().includes(needle)),
    [query, needle],
  );

  return (
    <Tabs
      className={S.fieldList}
      value={tab}
      onChange={(value) => setTab(value === "metrics" ? "metrics" : "columns")}
    >
      <Tabs.List mb="sm">
        <Tabs.Tab value="columns" leftSection={<Icon name="table" />}>
          {t`Columns`}
        </Tabs.Tab>
        <Tabs.Tab value="metrics" leftSection={<Icon name="metric" />}>
          {t`Metrics`}
        </Tabs.Tab>
      </Tabs.List>
      <TextInput
        mb="sm"
        size="sm"
        placeholder={tab === "columns" ? t`Find a column…` : t`Find a metric…`}
        leftSection={<Icon name="search" />}
        value={searchText}
        onChange={(event) => setSearchText(event.currentTarget.value)}
      />
      <Box className={S.fieldListScroll}>
        {tab === "columns" &&
          sections.map((section) => (
            <Box key={section.name} mb="sm">
              <Text className={S.fieldGroupName}>{section.name}</Text>
              {section.columns.map((column) => {
                const label = Lib.displayInfo(
                  query,
                  STAGE_INDEX,
                  column,
                ).displayName;
                return (
                  <DraggableField
                    key={`${section.name}:${label}`}
                    id={`pivot-field:${section.name}:${label}`}
                    icon={getColumnIcon(column)}
                    item={{ kind: "column", column, label }}
                    onAdd={onAdd}
                  />
                );
              })}
            </Box>
          ))}
        {tab === "metrics" &&
          (metrics.length > 0 ? (
            metrics.map((item) => (
              <DraggableField
                key={item.label}
                id={`pivot-metric:${item.label}`}
                icon="metric"
                item={item}
                onAdd={onAdd}
              />
            ))
          ) : (
            <Text c="text-secondary" p="sm">
              {t`No metrics are connected to this data yet.`}
            </Text>
          ))}
      </Box>
    </Tabs>
  );
}

type DraggableFieldProps = {
  id: string;
  icon: ReturnType<typeof getColumnIcon>;
  item: PivotFieldItem;
  onAdd: (item: PivotFieldItem) => void;
};

function DraggableField({ id, icon, item, onAdd }: DraggableFieldProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { type: "field", item } satisfies DragItem,
  });

  return (
    <Flex
      ref={setNodeRef}
      className={cx(S.fieldItem, { [S.isDragging]: isDragging })}
      align="center"
      gap="sm"
      data-testid="pivot-field-item"
      {...attributes}
      {...listeners}
      onClick={() => onAdd(item)}
    >
      <Icon name={icon} c="text-secondary" />
      <Text truncate flex={1}>
        {item.label}
      </Text>
      <Icon name="grabber" className={S.grabber} />
    </Flex>
  );
}
