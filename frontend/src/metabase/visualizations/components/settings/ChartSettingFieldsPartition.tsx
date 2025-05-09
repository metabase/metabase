import { useDisclosure } from "@mantine/hooks";
import { splice } from "icepick";
import { useEffect, useMemo, useState } from "react";
import {
  Draggable,
  Droppable,
  type OnDragEndResponder,
} from "react-beautiful-dnd";
import { t } from "ttag";
import _ from "underscore";

import { AggregationPicker } from "metabase/common/components/AggregationPicker";
import { DragDropContext } from "metabase/core/components/DragDropContext";
import CS from "metabase/css/core/index.css";
import { BreakoutPopover } from "metabase/querying/notebook/components/BreakoutStep";
import { Box, Button, Flex, Icon, Popover, Text } from "metabase/ui";
import type { RemappingHydratedDatasetColumn } from "metabase/visualizations/types";
import type { Partition } from "metabase/visualizations/visualizations/PivotTable/partitions";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import type {
  ColumnNameColumnSplitSetting,
  DatasetColumn,
} from "metabase-types/api";

import { ColumnItem } from "./ColumnItem";

type AddBreakoutPopoverProps = {
  query: Lib.Query;
  handleAddBreakout: (column: Lib.ColumnMetadata) => void;
};

const AddBreakoutPopover = ({ query, handleAddBreakout }: AddBreakoutPopoverProps) => {
  const [opened, { close, toggle }] = useDisclosure();
  return (
    <Popover
      opened={opened}
      onClose={close}
      position={"right-start"}
      onDismiss={close}
    >
      <Popover.Target>
        <Button
          variant="subtle"
          leftSection={<Icon name="add" />}
          size="compact-md"
          onClick={toggle}
          styles={{
            root: { paddingInline: 0 },
          }}
        >
          {t`Add`}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <BreakoutPopover
          query={query}
          stageIndex={-1}
          isMetric={false}
          breakout={undefined}
          breakoutIndex={undefined}
          onAddBreakout={handleAddBreakout}
          onUpdateBreakoutColumn={() => { }}
          onClose={close}
        />
      </Popover.Dropdown>
    </Popover>
  );
};

type AddAggregationPopoverProps = {
  query: Lib.Query;
};

const AddAggregationPopover = ({ query }: AddAggregationPopoverProps) => {
  const [opened, { close, toggle }] = useDisclosure();
  const operators = useMemo(() => {
    const baseOperators = Lib.availableAggregationOperators(query, -1);
    return Lib.filterPivotAggregationOperators(baseOperators);
  }, [query]);

  const [pivotQuery, updatePivotQuery] = useState(Lib.appendStage(query));

  return (
    <Popover
      opened={opened}
      onClose={close}
      position={"right-start"}
      onDismiss={close}
    >
      <Popover.Target>
        <Button
          variant="subtle"
          leftSection={<Icon name="add" />}
          size="compact-md"
          onClick={toggle}
          styles={{
            root: { paddingInline: 0 },
          }}
        >
          {t`Add`}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <AggregationPicker
          query={pivotQuery}
          operators={operators}
          stageIndex={-1}
          onClose={close}
          allowCustomExpressions={false}
          allowMetrics={false}
          onQueryChange={(query) => updatePivotQuery(query)}
        />
      </Popover.Dropdown>
    </Popover>
  );
};

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

// Aggregation & breakout clauses added to the base pivot query
type FieldPartitionAddedClauses = {
  rows: Lib.BreakoutClause[];
  columns: Lib.BreakoutClause[];
  values: Lib.AggregationClause[];
}

type FieldPartitionValue = {
  split: ColumnNameColumnSplitSetting;
  clauses: FieldPartitionAddedClauses;
}

type ChartSettingFieldPartitionProps = {
  value: FieldPartitionValue;
  onChange: (value: FieldPartitionValue) => void;
  onShowWidget: (
    widget: {
      id: string;
      props: {
        initialKey: string;
      };
    },
    ref: HTMLElement | undefined,
  ) => void;
  getColumnTitle: (column: DatasetColumn) => string;
  question: Question;
  partitions: Partition[];
  columns: RemappingHydratedDatasetColumn[];
  canEditColumns: boolean;
};

export const ChartSettingFieldsPartition = ({
  value,
  onChange,
  onShowWidget,
  getColumnTitle,
  question,
  partitions,
  columns,
  canEditColumns,
}: ChartSettingFieldPartitionProps) => {
  //useEffect(() => {
  //  console.log("value keys:", Object.keys(value));
  //}, [value]);

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
        split: {
          ...value.split,
          [sourcePartition]: columnMove(
            value.split[sourcePartition as keyof ColumnNameColumnSplitSetting],
            sourceIndex,
            destinationIndex,
          ),
        }
      });
    } else if (sourcePartition !== destinationPartition) {
      const column =
        value.split[sourcePartition as keyof ColumnNameColumnSplitSetting][
        sourceIndex
        ];

      onChange({
        ...value,
        split: {
          ...value.split,
          [sourcePartition]: columnRemove(
            value.split[sourcePartition as keyof ColumnNameColumnSplitSetting],
            sourceIndex,
          ),
          [destinationPartition]: columnAdd(
            value.split[destinationPartition as keyof ColumnNameColumnSplitSetting],
            destinationIndex,
            column,
          ),
        }
      });
    }
  };

  const updatedValue = useMemo(
    () => {
      const updatedSplit = _.mapObject(value.split || {}, (columnNames) => {
        return columnNames
          .map((columnName) => columns.find((col) => col.name === columnName))
          .filter((col): col is RemappingHydratedDatasetColumn => col != null);
      },
      );

      return {
        ...value,
        split: updatedSplit,
      }
    },
    [columns, value],
  );

  // TODO: maybe store unaggregated pivot details *only* in clauses?
  const handleAddBreakout = (partitionName: keyof ColumnNameColumnSplitSetting, column: Lib.ColumnMetadata) => {
    const newValue = {
      split: {
        ...value.split,
        [partitionName]: columnAdd(
          value.split[partitionName],
          -1,
          Lib.displayInfo(question.query(), -1, column).displayName
        )
      },
      clauses: {
        ...value.clauses,
        [partitionName]: [column]
      }
    };
    onChange(newValue);
  }

  const emptyColumnMessage = canEditColumns
    ? t`Add fields here`
    : t`Drag fields here`;

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      {partitions.map(({ name: partitionName, title }) => {
        const updatedColumns = updatedValue.split[partitionName] ?? [];
        const partitionType = getPartitionType(partitionName);
        const AggregationOrBreakoutPopover =
          partitionType === "metric" ?
            <AddAggregationPopover
              query={question.query()}
            />
            :
            <AddBreakoutPopover
              query={question.query()}
              handleAddBreakout={(column) => handleAddBreakout(partitionName, column)}
            />;
        return (
          <Box py="sm" key={partitionName}>
            <Flex align="center" justify="space-between">
              <Text c="text-medium">{title}</Text>
              {canEditColumns && AggregationOrBreakoutPopover}
            </Flex>
            <Droppable
              droppableId={partitionName}
              type={partitionType}
              renderClone={(provided, _snapshot, rubric) => (
                <Box
                  ref={provided.innerRef}
                  {...provided.draggableProps}
                  {...provided.dragHandleProps}
                  mb="0.5rem"
                >
                  <Column
                    onEditFormatting={handleEditFormatting}
                    column={updatedColumns[rubric.source.index]}
                    title={getColumnTitle(updatedColumns[rubric.source.index])}
                  />
                </Box>
              )}
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
                      {emptyColumnMessage}
                    </Box>
                  ) : (
                    updatedColumns.map((col, index) => (
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
                            />
                          </Box>
                        )}
                      </Draggable>
                    ))
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
}: {
  title: string;
  column: RemappingHydratedDatasetColumn;
  onEditFormatting: (
    column: RemappingHydratedDatasetColumn,
    target: HTMLElement,
  ) => void;
}) => (
  <ColumnItem
    title={title}
    onEdit={(target) => onEditFormatting?.(column, target)}
    draggable
    className={CS.m0}
  />
);
