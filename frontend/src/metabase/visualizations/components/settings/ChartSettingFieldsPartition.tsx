import { useDisclosure } from "@mantine/hooks";
import { useMemo } from "react";
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
  ColumnNameAndBinning,
  DatasetColumn,
  FieldReference,
  PivotTableColumnSplitSetting,
} from "metabase-types/api";

import { ColumnItem } from "./ColumnItem";

type AddBreakoutPopoverProps = {
  query: Lib.Query;
  onAddBreakout: (column: Lib.ColumnMetadata) => void;
};

const AddBreakoutPopover = ({
  query,
  onAddBreakout,
}: AddBreakoutPopoverProps) => {
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
          onAddBreakout={onAddBreakout}
          onUpdateBreakoutColumn={() => {}}
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
          query={query}
          operators={operators}
          stageIndex={-1}
          onClose={close}
          allowCustomExpressions={false}
          allowMetrics={false}
          onQueryChange={() => {}}
        />
      </Popover.Dropdown>
    </Popover>
  );
};

type PartitionedColumn =
  | string
  | ColumnNameAndBinning
  | (FieldReference | null);

const columnMove = (
  columns: PartitionedColumn[],
  from: number,
  to: number,
): PartitionedColumn[] => {
  const copy = [...columns];
  const [moved] = copy.splice(from, 1);
  copy.splice(to, 0, moved);
  return copy;
};

const columnRemove = (
  columns: PartitionedColumn[],
  from: number,
): PartitionedColumn[] => {
  return [...columns.slice(0, from), ...columns.slice(from + 1)];
};

const columnAdd = (
  columns: PartitionedColumn[],
  to: number,
  column: PartitionedColumn,
): PartitionedColumn[] => {
  return [...columns.slice(0, to), column, ...columns.slice(to)];
};

type ChartSettingFieldPartitionProps = {
  value: PivotTableColumnSplitSetting;
  onChange: (value: PivotTableColumnSplitSetting) => void;
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
    partitionName: keyof PivotTableColumnSplitSetting,
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
          value[sourcePartition as keyof PivotTableColumnSplitSetting],
          sourceIndex,
          destinationIndex,
        ),
      });
    } else if (sourcePartition !== destinationPartition) {
      const column =
        value[sourcePartition as keyof PivotTableColumnSplitSetting][
          sourceIndex
        ];

      onChange({
        ...value,
        [sourcePartition]: columnRemove(
          value[sourcePartition as keyof PivotTableColumnSplitSetting],
          sourceIndex,
        ),
        [destinationPartition]: columnAdd(
          value[destinationPartition as keyof PivotTableColumnSplitSetting],
          destinationIndex,
          column,
        ),
      });
    }
  };

  const updatedValue = useMemo(() => {
    return _.mapObject(
      value || {},
      (columnsOrNames: string[] | ColumnNameAndBinning[]) => {
        const columnNames = columnsOrNames.map((col) => {
          return typeof col === "string" ? col : col.name;
        });

        return columnNames
          .map((columnName) => columns.find((col) => col.name === columnName))
          .filter((col): col is RemappingHydratedDatasetColumn => col != null);
      },
    );
  }, [columns, value]);

  const onAddBreakout = (
    partition: keyof PivotTableColumnSplitSetting,
    column: Lib.ColumnMetadata,
  ) => {
    const binning = Lib.binning(column);
    const binningInfo = binning ? Lib.displayInfo(query, 0, binning) : null;
    const bucket = Lib.temporalBucket(column);
    const bucketName = bucket
      ? Lib.displayInfo(query, 0, bucket).shortName
      : null;
    onChange({
      ...value,
      [partition]: columnAdd(value[partition], -1, {
        name: Lib.displayInfo(question.query(), -1, column).name,
        binning: binningInfo || bucketName,
      }),
    });
  };

  const onRemoveBreakout = (
    partition: keyof PivotTableColumnSplitSetting,
    index: number,
  ) => {
    onChange({
      ...value,
      [partition]: columnRemove(value[partition], index),
    });
  };

  const emptyColumnMessage = canEditColumns
    ? t`Add fields here`
    : t`Drag fields here`;

  const query = question.query();

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      {partitions.map(({ name: partitionName, title }) => {
        const updatedColumns = updatedValue[partitionName] ?? [];
        const partitionType = getPartitionType(partitionName);
        const AggregationOrBreakoutPopover =
          partitionType === "metric" ? (
            <AddAggregationPopover query={query} />
          ) : (
            <AddBreakoutPopover
              query={query}
              onAddBreakout={(column) => onAddBreakout(partitionName, column)}
            />
          );
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
                        key={`draggable-${col.name}-${index}`}
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
                              onRemove={() =>
                                onRemoveBreakout(partitionName, index)
                              }
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
    onRemove={() => onRemove?.()}
    removeIcon="close"
    draggable
    className={CS.m0}
  />
);
