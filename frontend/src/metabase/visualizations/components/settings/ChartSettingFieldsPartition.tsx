import { splice } from "icepick";
import type React from "react";
import { useCallback, useMemo } from "react";
import {
  Draggable,
  Droppable,
  type OnDragEndResponder,
} from "react-beautiful-dnd";
import { t } from "ttag";
import _ from "underscore";

import { DragDropContext } from "metabase/core/components/DragDropContext";
import CS from "metabase/css/core/index.css";
import { isNotNull } from "metabase/lib/types";
import { Box, Flex, Text } from "metabase/ui";
import type { RemappingHydratedDatasetColumn } from "metabase/visualizations/types";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import type { DatasetColumn } from "metabase-types/api";

import { ColumnItem } from "./ColumnItem";

export const columnMove = <TItem,>(
  columns: TItem[],
  from: number,
  to: number,
) => {
  const columnCopy = [...columns];
  columnCopy.splice(to, 0, columnCopy.splice(from, 1)[0]);
  return columnCopy;
};

export const columnRemove = <TItem,>(columns: TItem[], from: number) => {
  return splice(columns, from, 1);
};

export const columnAdd = <TItem,>(
  columns: TItem[],
  to: number,
  column: TItem,
) => {
  return splice(columns, to, 0, column);
};

type ColumnPartitionValue<TGroup = unknown, TValue = unknown> = {
  rows: TGroup[];
  columns: TGroup[];
  values: TValue[];
};

export type Partitions = [
  { name: "rows"; title: React.ReactNode },
  { name: "columns"; title: React.ReactNode },
  { name: "values"; title: React.ReactNode },
];

type PartitionName = keyof ColumnPartitionValue;

export interface ChartSettingFieldsPartitionProps<TGroup, TValue> {
  value: ColumnPartitionValue<TGroup, TValue>;
  onChange: (value: ColumnPartitionValue<TGroup, TValue>) => void;
  onShowWidget: (
    widget: { id: string; props: { initialKey: string } },
    ref: HTMLElement | undefined,
  ) => void;
  getColumnTitle: (column: DatasetColumn) => string;
  columns: RemappingHydratedDatasetColumn[];
  partitions: Partitions;
  emptySectionText?: string;
  canRemoveColumns?: boolean;
  renderAddColumnButton: (partition: PartitionName) => React.ReactNode;
  getColumn?: (
    entry: TGroup | TValue,
    partition: PartitionName,
    index: number,
  ) => DatasetColumn | undefined;
}

export const ChartSettingFieldsPartition = <TGroup, TValue>({
  value,
  onChange,
  onShowWidget,
  getColumnTitle,
  partitions,
  columns,
  emptySectionText = t`Drag fields here`,
  renderAddColumnButton,
  canRemoveColumns,
  getColumn = (columnName) => columns.find((col) => col.name === columnName),
}: ChartSettingFieldsPartitionProps<TGroup, TValue>) => {
  const handleEditFormatting = (
    column: RemappingHydratedDatasetColumn,
    targetElement: HTMLElement,
  ) => {
    if (column) {
      onShowWidget(
        {
          id: "column_settings",
          props: {
            initialKey: getColumnKey(column),
          },
        },
        targetElement,
      );
    }
  };

  const getPartitionType = (partitionName: PartitionName) => {
    switch (partitionName) {
      case "rows":
      case "columns":
        return "dimension";
      default:
        return "metric";
    }
  };

  const handleDragEnd: OnDragEndResponder = ({ source, destination }) => {
    if (!source || !destination) {
      return;
    }
    const sourcePartition = source.droppableId as PartitionName;
    const destinationPartition = destination.droppableId as PartitionName;

    if (
      sourcePartition === destinationPartition &&
      source.index !== destination.index
    ) {
      onChange({
        ...value,
        [sourcePartition]: columnMove(
          value[sourcePartition] as any,
          source.index,
          destination.index,
        ),
      });
    } else if (sourcePartition !== destinationPartition) {
      const column = value[sourcePartition][source.index];

      onChange({
        ...value,
        [sourcePartition]: columnRemove(
          value[sourcePartition] as any,
          source.index,
        ),
        [destinationPartition]: columnAdd(
          value[destinationPartition],
          destination.index,
          column,
        ),
      });
    }
  };

  const handleRemove = useCallback(
    (partition: PartitionName, index: number) => {
      onChange({
        ...value,
        [partition]: columnRemove(value[partition] as any, index),
      });
    },
    [onChange, value],
  );

  const valueWithColumns = useMemo(
    () =>
      _.mapObject(value || {}, (columnEntries, partition) =>
        columnEntries
          .map((columnEntry, index) =>
            getColumn(columnEntry, partition as PartitionName, index),
          )
          .filter(isNotNull),
      ),
    [getColumn, value],
  );

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      {partitions.map(({ name: partitionName, title }) => {
        const updatedColumns = valueWithColumns[partitionName] ?? [];
        const partitionType = getPartitionType(partitionName);

        return (
          <Box py="sm" key={partitionName}>
            <Flex align="center" justify="space-between">
              <Text c="text-medium">{title}</Text>
              {renderAddColumnButton?.(partitionName)}
            </Flex>
            <Droppable
              droppableId={partitionName}
              type={partitionType}
              renderClone={(provided, _snapshot, rubric) => {
                const column = updatedColumns[rubric.source.index];
                return (
                  <Box
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    mb="0.5rem"
                  >
                    {column && (
                      <Column
                        onEditFormatting={handleEditFormatting}
                        column={column}
                        title={getColumnTitle(column)}
                        onRemove={canRemoveColumns ? () => {} : undefined}
                      />
                    )}
                  </Box>
                );
              }}
            >
              {(provided, snapshot) => (
                <Box
                  {...provided.droppableProps}
                  bg={snapshot.draggingFromThisWith ? "border" : "none"}
                  ref={provided.innerRef}
                  mih="2.5rem"
                  pos="relative"
                  mt={updatedColumns.length === 0 ? "sm" : undefined}
                  className={CS.rounded}
                >
                  {updatedColumns.length === 0 ? (
                    <Box
                      pos="absolute"
                      w="100%"
                      p="0.75rem"
                      bg="bg-light"
                      bd="1px dashed border"
                      c="text-light"
                      ta="center"
                      className={CS.rounded}
                    >
                      {emptySectionText}
                    </Box>
                  ) : (
                    updatedColumns.map((col, index) => {
                      return (
                        col && (
                          <Draggable
                            key={`draggable-${col.name}`}
                            draggableId={`draggable-${col.name}`}
                            index={index}
                          >
                            {(provided) => (
                              <Box
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={CS.mb1}
                              >
                                <Column
                                  key={`${partitionName}-${col.name}`}
                                  column={col}
                                  onEditFormatting={handleEditFormatting}
                                  title={getColumnTitle(col)}
                                  onRemove={
                                    canRemoveColumns
                                      ? () => handleRemove(partitionName, index)
                                      : undefined
                                  }
                                />
                              </Box>
                            )}
                          </Draggable>
                        )
                      );
                    })
                  )}
                  {provided.placeholder}
                </Box>
              )}
            </Droppable>
          </Box>
        );
      })}
    </DragDropContext>
  );
};

const Column = ({
  title,
  column,
  onEditFormatting,
  onRemove,
}: {
  title: string;
  column: RemappingHydratedDatasetColumn;
  onEditFormatting: (
    column: RemappingHydratedDatasetColumn,
    target: HTMLElement,
  ) => void;
  onRemove?: () => void;
}) => (
  <ColumnItem
    title={title}
    onEdit={(target) => onEditFormatting?.(column, target)}
    onRemove={onRemove}
    removeIcon="close"
    draggable
    className={CS.m0}
  />
);
