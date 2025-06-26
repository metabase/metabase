import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { splice } from "icepick";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

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

const columnMove = (columns: string[], from: number, to: number) => {
  const columnCopy = [...columns];
  columnCopy.splice(to, 0, columnCopy.splice(from, 1)[0]);
  return columnCopy;
};

const columnRemove = (columns: string[], from: number) =>
  splice(columns, from, 1);

const columnAdd = (columns: string[], to: number, column: string) =>
  splice(columns, to, 0, column);

const getPartitionType = (
  partitionName: keyof ColumnNameColumnSplitSetting,
) => {
  switch (partitionName) {
    case "rows":
    case "columns":
      return "dimension";
    default:
      return "metric";
  }
};

const getSortableId = (
  partitionName: keyof ColumnNameColumnSplitSetting,
  columnName: string,
) => `${partitionName}::${columnName}`;
const destructSortableId = (sortableId: string | null | undefined) =>
  (sortableId?.split("::") || [null, null]) as [
    keyof ColumnNameColumnSplitSetting,
    string,
  ];
const isSortableId = (id: string) => id.includes("::");

export const ChartSettingFieldsPartition = ({
  value,
  onChange,
  onShowWidget,
  getColumnTitle,
  partitions,
  columns,
}: {
  value: ColumnNameColumnSplitSetting;
  onChange: (value: ColumnNameColumnSplitSetting) => void;
  onShowWidget: (
    widget: { id: string; props: { initialKey: string } },
    ref: HTMLElement | undefined,
  ) => void;
  getColumnTitle: (column: DatasetColumn) => string;
  partitions: Partition[];
  columns: RemappingHydratedDatasetColumn[];
}) => {
  const [activeId, setActiveId] = useState<string | null>(null);

  const { sourcePartition, activeColumn } = useMemo(() => {
    const [sourcePartition, activeColumnName] = destructSortableId(activeId);
    const activeColumn = columns.find((col) => col.name === activeColumnName);

    return {
      sourcePartition,
      activeColumn,
    };
  }, [activeId, columns]);

  const handleEditFormatting = useCallback(
    (column: RemappingHydratedDatasetColumn, targetElement: HTMLElement) => {
      onShowWidget(
        { id: "column_settings", props: { initialKey: getColumnKey(column) } },
        targetElement,
      );
    },
    [onShowWidget],
  );

  const updatedValue = useMemo(
    () =>
      _.mapObject(value || {}, (columnNames) =>
        columnNames
          .map((columnName) => columns.find((col) => col.name === columnName))
          .filter((col): col is RemappingHydratedDatasetColumn => col != null),
      ),
    [columns, value],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 15 },
    }),
  );

  const handleDragStart = useCallback(({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
  }, []);

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      setActiveId(null);

      if (!over) {
        return;
      }

      const activeId = active.id.toString();
      const overId = over.id.toString();

      const [sourcePartition, sourceColumnName] = destructSortableId(activeId);

      const [overPartition, overColumnName] = isSortableId(overId)
        ? destructSortableId(overId)
        : [overId, null];

      const sourcePartitionColumns =
        value[sourcePartition as keyof typeof value] || [];
      const destinationPartitionColumns =
        value[overPartition as keyof typeof value] || [];

      const fromIndex = sourcePartitionColumns.indexOf(sourceColumnName);
      const toIndex = overColumnName
        ? destinationPartitionColumns.indexOf(overColumnName)
        : destinationPartitionColumns.length;

      if (sourcePartition === overPartition && fromIndex === toIndex) {
        return;
      }

      onChange(
        sourcePartition === overPartition
          ? {
              ...value,
              [sourcePartition]: columnMove(
                sourcePartitionColumns,
                fromIndex,
                toIndex,
              ),
            }
          : {
              ...value,
              [sourcePartition]: columnRemove(
                sourcePartitionColumns,
                fromIndex,
              ),
              [overPartition]: columnAdd(
                destinationPartitionColumns,
                toIndex,
                sourceColumnName,
              ),
            },
      );
    },
    [onChange, value],
  );

  const handleDragCancel = useCallback(() => setActiveId(null), []);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {partitions.map(({ name: partitionName, title }, idx) => {
        const items =
          value[partitionName]?.map((columnName) =>
            getSortableId(partitionName, columnName),
          ) || [];

        const hydrated = updatedValue[partitionName] || [];
        const partitionType = getPartitionType(partitionName);

        const sourcePartitionType = sourcePartition
          ? getPartitionType(sourcePartition)
          : null;
        const droppableDisabled = partitionType !== sourcePartitionType;

        return (
          <Box
            key={partitionName}
            py="md"
            className={idx > 0 ? CS.borderTop : undefined}
          >
            <Text c="text-medium">{title}</Text>

            <SortableContext
              id={partitionType}
              items={items}
              strategy={verticalListSortingStrategy}
            >
              <Droppable
                id={partitionName}
                disabled={droppableDisabled}
                isDragging={!!activeId}
              >
                {hydrated.length === 0 ? (
                  <Box
                    w="100%"
                    p="0.75rem"
                    bg="border"
                    c="text-medium"
                    className={CS.rounded}
                  >
                    {t`Drag fields here`}
                  </Box>
                ) : (
                  <Box mih="2.5rem" className={CS.rounded}>
                    {hydrated.map((column) => (
                      <Sortable
                        key={getSortableId(partitionName, column.name)}
                        id={getSortableId(partitionName, column.name)}
                        draggingStyle={{ opacity: 0.5 }}
                      >
                        <ColumnItem
                          className={CS.m0}
                          title={getColumnTitle(column)}
                          draggable
                          onEdit={(target) =>
                            handleEditFormatting(column, target)
                          }
                        />
                      </Sortable>
                    ))}
                  </Box>
                )}
              </Droppable>
            </SortableContext>
          </Box>
        );
      })}

      <DragOverlay>
        {activeId && activeColumn && (
          <ColumnItem
            title={getColumnTitle(activeColumn)}
            draggable
            onEdit={() => {}}
          />
        )}
      </DragOverlay>
    </DndContext>
  );
};

function Droppable({
  children,
  id,
  disabled,
  isDragging,
}: {
  children: ReactNode;
  id: string;
  disabled: boolean;
  isDragging: boolean;
}) {
  const { setNodeRef } = useDroppable({
    id,
    disabled,
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
}
