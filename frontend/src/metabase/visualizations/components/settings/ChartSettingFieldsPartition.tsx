import { DragOverlay, useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { type ReactNode, useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  MultiContainerDraggableContext,
  type MultiContainerDraggableContextShouldUpdateStateData,
  findContainer,
} from "metabase/common/components/MultiContainerDraggableContext";
import { Sortable } from "metabase/common/components/Sortable";
import CS from "metabase/css/core/index.css";
import { Box, Text } from "metabase/ui";
import type { RemappingHydratedDatasetColumn } from "metabase/visualizations/types";
import type { Partition } from "metabase/visualizations/visualizations/PivotTable/partitions";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import type {
  ColumnNameColumnSplitSetting,
  DatasetColumn,
} from "metabase-types/api";

import { ColumnItem } from "./ColumnItem";

const EMPTY_VALUE: ColumnNameColumnSplitSetting = {
  columns: [],
  rows: [],
  values: [],
};

const makeShouldUpdateDraggableContextState =
  (partitions: Partition[], columns: RemappingHydratedDatasetColumn[]) =>
  ({
    activeId,
    overContainer,
    items,
  }: MultiContainerDraggableContextShouldUpdateStateData<ColumnNameColumnSplitSetting>) => {
    const targetPartition = partitions.find((p) => p.name === overContainer);
    if (!targetPartition) {
      return false;
    }
    // Enforce a per-partition maximum (e.g. the single-column "Breakdown").
    if (
      targetPartition.maxSize != null &&
      (items[overContainer]?.length ?? 0) >= targetPartition.maxSize
    ) {
      return false;
    }
    const activeColumn = columns.find((col) => col.name === activeId);
    if (!activeColumn) {
      return true;
    }
    return (
      targetPartition.columnFilter == null ||
      targetPartition.columnFilter(activeColumn)
    );
  };

type ChartSettingFieldsPartitionInternalProps = {
  activeId: string | null;
  items: ColumnNameColumnSplitSetting;
} & Pick<
  ChartSettingFieldsPartitionProps,
  "columns" | "partitions" | "getColumnTitle" | "onShowWidget"
>;

const ChartSettingFieldsPartitionInternal = ({
  activeId,
  items,
  columns,
  partitions,
  getColumnTitle,
  onShowWidget,
}: ChartSettingFieldsPartitionInternalProps) => {
  const { sourcePartition, activeColumn } = useMemo(() => {
    const sourcePartition = findContainer(activeId, items);
    const activeColumn = columns.find((col) => col.name === activeId);

    return {
      sourcePartition,
      activeColumn,
    };
  }, [activeId, columns, items]);

  const columnsByPartitionName = useMemo(
    () =>
      _.mapObject(items || {}, (columnNames) =>
        columnNames
          .map((columnName) => columns.find((col) => col.name === columnName))
          .filter((col): col is RemappingHydratedDatasetColumn => col != null),
      ),
    [columns, items],
  );

  return (
    <>
      {partitions.map((partition) => (
        <PartitionContainer
          key={partition.name}
          partitionName={partition.name as keyof ColumnNameColumnSplitSetting}
          partitions={partitions}
          items={items}
          sourcePartition={sourcePartition}
          activeColumn={activeColumn}
          columnsByPartitionName={columnsByPartitionName}
          activeId={activeId}
          getColumnTitle={getColumnTitle}
          onShowWidget={onShowWidget}
        />
      ))}

      <DragOverlay>
        {activeId && activeColumn && (
          <ColumnItem
            title={getColumnTitle(activeColumn)}
            draggable
            onEdit={() => {}}
          />
        )}
      </DragOverlay>
    </>
  );
};

const PartitionContainer = ({
  partitionName,
  partitions,
  items,
  sourcePartition,
  activeColumn,
  columnsByPartitionName,
  activeId,
  getColumnTitle,
  onShowWidget,
}: {
  partitionName: keyof ColumnNameColumnSplitSetting;
  items: ColumnNameColumnSplitSetting;
  sourcePartition: keyof ColumnNameColumnSplitSetting | null;
  activeColumn: RemappingHydratedDatasetColumn | undefined;
  columnsByPartitionName: Record<
    keyof ColumnNameColumnSplitSetting,
    RemappingHydratedDatasetColumn[]
  >;
  activeId: string | null;
} & Pick<
  ChartSettingFieldsPartitionProps,
  "partitions" | "getColumnTitle" | "onShowWidget"
>) => {
  const partitionIndex = useMemo(
    () => partitions.findIndex((partition) => partition.name === partitionName),
    [partitionName, partitions],
  );
  const partition = partitions[partitionIndex];

  const handleEditFormatting = useCallback(
    (column: RemappingHydratedDatasetColumn, targetElement: HTMLElement) => {
      onShowWidget(
        { id: "column_settings", props: { initialKey: getColumnKey(column) } },
        targetElement,
      );
    },
    [onShowWidget],
  );

  if (!partition) {
    return null;
  }

  const { title } = partition;

  const columnNames = items[partitionName];
  const columns = columnsByPartitionName[partitionName] || [];

  const droppableDisabled =
    sourcePartition === null ||
    (activeColumn != null &&
      partition.columnFilter != null &&
      !partition.columnFilter(activeColumn));

  return (
    <Box py="md" className={partitionIndex > 0 ? CS.borderTop : undefined}>
      <Text c="text-secondary">{title}</Text>

      <SortableContext
        id={partitionName}
        items={columnNames}
        strategy={verticalListSortingStrategy}
      >
        <DroppableItem
          id={partitionName}
          disabled={droppableDisabled}
          isDragging={!!activeId}
        >
          {columns.length === 0 ? (
            <Box
              w="100%"
              p="0.75rem"
              bg="border"
              c="text-secondary"
              className={CS.rounded}
            >
              {t`Drag fields here`}
            </Box>
          ) : (
            <Box mih="2.5rem" className={CS.rounded}>
              {columns.map((column) => (
                <Sortable
                  key={column.name}
                  id={column.name}
                  draggingStyle={{ opacity: 0.5 }}
                >
                  <ColumnItem
                    className={CS.m0}
                    title={getColumnTitle(column)}
                    draggable
                    onEdit={(target) => handleEditFormatting(column, target)}
                  />
                </Sortable>
              ))}
            </Box>
          )}
        </DroppableItem>
      </SortableContext>
    </Box>
  );
};

type DroppableItemProps = {
  children: ReactNode;
  id: string;
  disabled: boolean;
  isDragging: boolean;
};

const DroppableItem = ({
  children,
  id,
  disabled,
  isDragging,
}: DroppableItemProps) => {
  const { setNodeRef } = useDroppable({
    id,
  });

  return (
    <Box
      ref={setNodeRef}
      mih="2.5rem"
      className={CS.rounded}
      {...(isDragging && !disabled && { bg: "border" })}
    >
      {children}
    </Box>
  );
};

type ChartSettingFieldsPartitionProps = {
  value?: ColumnNameColumnSplitSetting;
  onChange: (value: ColumnNameColumnSplitSetting) => void;
  onShowWidget: (
    widget: { id: string; props: { initialKey: string } },
    ref: HTMLElement | undefined,
  ) => void;
  getColumnTitle: (column: DatasetColumn) => string;
  partitions: Partition[];
  columns: RemappingHydratedDatasetColumn[];
};

export const ChartSettingFieldsPartition = ({
  value,
  partitions,
  columns,
  getColumnTitle,
  onChange,
  onShowWidget,
}: ChartSettingFieldsPartitionProps) => {
  const currentItems = value ?? EMPTY_VALUE;
  const shouldUpdateState = useCallback(
    (
      data: MultiContainerDraggableContextShouldUpdateStateData<ColumnNameColumnSplitSetting>,
    ) => makeShouldUpdateDraggableContextState(partitions, columns)(data),
    [partitions, columns],
  );
  return (
    <MultiContainerDraggableContext<ColumnNameColumnSplitSetting>
      value={currentItems}
      shouldUpdateState={shouldUpdateState}
      onChange={onChange}
    >
      {({ activeId, items }) => (
        <ChartSettingFieldsPartitionInternal
          activeId={activeId}
          items={items}
          partitions={partitions}
          columns={columns}
          getColumnTitle={getColumnTitle}
          onShowWidget={onShowWidget}
        />
      )}
    </MultiContainerDraggableContext>
  );
};
