import cx from "classnames";
import { splice } from "icepick";
import { useMemo } from "react";
import {
  Draggable,
  Droppable,
  type OnDragEndResponder,
} from "react-beautiful-dnd";
import { t } from "ttag";
import _ from "underscore";

import Label from "metabase/components/type/Label";
import { DragDropContext } from "metabase/core/components/DragDropContext";
import CS from "metabase/css/core/index.css";
import type { RemappingHydratedDatasetColumn } from "metabase/visualizations/types";
import type { Partition } from "metabase/visualizations/visualizations/PivotTable/partitions";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import type {
  ColumnNameColumnSplitSetting,
  DatasetColumn,
} from "metabase-types/api";

import {
  DroppableContainer,
  EmptyColumnPlaceholder,
  FieldPartitionColumn,
} from "./ChartSettingFieldsPartition.styled";

const columnMove = (columns: string[], from: number, to: number) => {
  const columnCopy = [...columns];
  columnCopy.splice(to, 0, columnCopy.splice(from, 1)[0]);
  return columnCopy;
};

const columnRemove = (columns: string[], from: number) => {
  return splice(columns, from, 1);
};

const columnAdd = (columns: string[], to: number, column: string) => {
  return splice(columns, to, 0, column);
};

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
  columns: RemappingHydratedDatasetColumn[];
  partitions: Partition[];
}) => {
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

  const handleDragEnd: OnDragEndResponder = ({ source, destination }) => {
    if (!source || !destination) {
      return;
    }
    const { droppableId: sourcePartition, index: sourceIndex } = source;
    const { droppableId: destinationPartition, index: destinationIndex } =
      destination;

    if (
      sourcePartition === destinationPartition &&
      sourceIndex !== destinationIndex
    ) {
      onChange({
        ...value,
        [sourcePartition]: columnMove(
          value[sourcePartition as keyof ColumnNameColumnSplitSetting],
          sourceIndex,
          destinationIndex,
        ),
      });
    } else if (sourcePartition !== destinationPartition) {
      const column =
        value[sourcePartition as keyof ColumnNameColumnSplitSetting][
          sourceIndex
        ];

      onChange({
        ...value,
        [sourcePartition]: columnRemove(
          value[sourcePartition as keyof ColumnNameColumnSplitSetting],
          sourceIndex,
        ),
        [destinationPartition]: columnAdd(
          value[destinationPartition as keyof ColumnNameColumnSplitSetting],
          destinationIndex,
          column,
        ),
      });
    }
  };

  const updatedValue = useMemo(
    () =>
      _.mapObject(value || {}, columnNames =>
        columnNames
          .map(columnName => columns.find(col => col.name === columnName))
          .filter((col): col is RemappingHydratedDatasetColumn => col != null),
      ),
    [columns, value],
  );

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      {partitions.map(({ name: partitionName, title }, index) => {
        const updatedColumns = updatedValue[partitionName] ?? [];
        const partitionType = getPartitionType(partitionName);
        return (
          <div
            className={cx(CS.py2, { [CS.borderTop]: index > 0 })}
            key={partitionName}
          >
            <Label color="medium">{title}</Label>
            <Droppable droppableId={partitionName} type={partitionType}>
              {(provided, snapshot) => (
                <DroppableContainer
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  isDragSource={!!snapshot.draggingFromThisWith}
                >
                  {updatedColumns.length === 0 ? (
                    <EmptyColumnPlaceholder>{t`Drag fields here`}</EmptyColumnPlaceholder>
                  ) : (
                    updatedColumns.map((col, index) => (
                      <Draggable
                        key={`draggable-${col.name}`}
                        draggableId={`draggable-${col.name}`}
                        index={index}
                      >
                        {provided => (
                          <div
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
                            />
                          </div>
                        )}
                      </Draggable>
                    ))
                  )}
                  {provided.placeholder}
                </DroppableContainer>
              )}
            </Droppable>
          </div>
        );
      })}
    </DragDropContext>
  );
};

const Column = ({
  title,
  column,
  onEditFormatting,
}: {
  title: string;
  column: RemappingHydratedDatasetColumn;
  onEditFormatting: (
    column: RemappingHydratedDatasetColumn,
    target: HTMLElement,
  ) => void;
}) => (
  <FieldPartitionColumn
    title={title}
    onEdit={target => onEditFormatting?.(column, target)}
    draggable
    isDisabled={false}
  />
);
