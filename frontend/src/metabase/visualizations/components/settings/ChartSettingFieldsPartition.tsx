import { useDisclosure } from "@mantine/hooks";
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
  ColumnNameAndBinning,
  ColumnNameAndBinningSplitSetting,
  DatasetColumn,
  FieldReference,
  PivotAggregation,
  PivotTableColumnSplitSetting,
} from "metabase-types/api";

import { ColumnItem } from "./ColumnItem";

type PartitionName = keyof PivotTableColumnSplitSetting;

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
  onAddAggregation: (query: Lib.Query) => void;
};

const AddAggregationPopover = ({
  query,
  onAddAggregation,
}: AddAggregationPopoverProps) => {
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
          onQueryChange={onAddAggregation}
        />
      </Popover.Dropdown>
    </Popover>
  );
};

type PartitionedColumn =
  | string
  | ColumnNameAndBinning
  | PivotAggregation
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
  aggregatedColumns?: RemappingHydratedDatasetColumn[];
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
  aggregatedColumns,
  canEditColumns,
}: ChartSettingFieldPartitionProps) => {
  const [pendingAggCols, setPendingAggCols] = useState<
    RemappingHydratedDatasetColumn[] | null
  >(null);

  useEffect(() => {
    if (aggregatedColumns) {
      setPendingAggCols(null);
    }
  }, [aggregatedColumns]);

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
          value[sourcePartition as PartitionName],
          sourceIndex,
          destinationIndex,
        ),
      });
    } else if (sourcePartition !== destinationPartition) {
      const column = value[sourcePartition as PartitionName][sourceIndex];

      onChange({
        ...value,
        [sourcePartition]: columnRemove(
          value[sourcePartition as PartitionName],
          sourceIndex,
        ),
        [destinationPartition]: columnAdd(
          value[destinationPartition as PartitionName],
          destinationIndex,
          column,
        ),
      });
    }

    // Since aggregatedColumns is the source of truth for the order of pivot
    // measures, we need to swap the aggregation indexes so that the order
    // doesn't flicker between drag-and-drop and query re-run.
    // TODO:this feels pretty hacky
    if (aggregatedColumns && destinationPartition === "values") {
      const newPendingAggCols = aggregatedColumns.map((col) => {
        if (col?.aggregation_index === sourceIndex) {
          col.aggregation_index = destinationIndex;
        } else if (col?.aggregation_index === destinationIndex) {
          col.aggregation_index = sourceIndex;
        }

        return col;
      });
      setPendingAggCols(newPendingAggCols);
    }
  };

  const query = question.query();

  // If we're in unaggregated pivot mode, build up the aggregated version of
  // the query from the viz settings to pass into the aggregation selection
  // popover
  const aggregatedQuery = useMemo(() => {
    if (!canEditColumns) {
      return query;
    }

    const aggregations = (value?.values as PivotAggregation[]) || [];
    if (aggregations.length === 0) {
      return query;
    }

    const breakoutColumns = Lib.breakoutableColumns(query, -1);
    const operators = Lib.availableAggregationOperators(query, 0);

    return aggregations.reduce((accQuery, agg) => {
      const columnObj = agg.column
        ? breakoutColumns.find(
            (col) => Lib.displayInfo(query, -1, col).name === agg.column?.name,
          )
        : undefined;

      const operator = operators.find(
        (op) => Lib.displayInfo(query, -1, op).shortName === agg.name,
      );

      if (operator) {
        const clause = Lib.aggregationClause(operator, columnObj);
        return Lib.aggregate(accQuery, -1, clause);
      }

      return accQuery;
    }, query);
  }, [query, canEditColumns, value]);

  const updatedValue = useMemo(() => {
    // Pre-aggregated pivots: just look up columns by name
    if (!canEditColumns) {
      return _.mapObject(value || {}, (columnNames) =>
        columnNames
          .map((columnName) => columns.find((col) => col.name === columnName))
          .filter((col): col is RemappingHydratedDatasetColumn => col != null),
      );
    }

    // Unaggregated pivots: look up by name & binning in the pivot result
    // columns (aggregatedColumns), when available
    return _.mapObject(value || {}, (partitionValue, partition) => {
      if (partition === "values") {
        const aggregations = partitionValue as PivotAggregation[];
        const cols = aggregations.map((_agg, aggIndex) => {
          return (pendingAggCols || aggregatedColumns)?.find((col) => {
            return col?.aggregation_index === aggIndex;
          });
        });
        return cols;
      } else {
        // For dimension partitions (rows, columns)
        const dimensionItems = partitionValue as (
          | string
          | ColumnNameAndBinning
        )[];
        return dimensionItems
          .map((item) => {
            const columnName = typeof item === "string" ? item : item.name;
            return aggregatedColumns?.find((col) => col.name === columnName);
          })
          .filter((col): col is RemappingHydratedDatasetColumn => col != null);
      }
    });
  }, [canEditColumns, columns, aggregatedColumns, pendingAggCols, value]);

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
    const columnName = Lib.displayInfo(question.query(), -1, column).name;
    onChange({
      ...value,
      [partition]: columnAdd(value[partition], -1, {
        name: columnName,
        binning: binningInfo || bucketName,
      }),
    });
  };

  const onAddAggregation = (query: Lib.Query) => {
    const aggs = Lib.aggregations(query, -1);
    const aggDetails = aggs.map((agg) => {
      const aggDisplay = Lib.displayInfo(query, -1, agg);
      const column = Lib.aggregationColumn(query, -1, agg);
      const bucket = column && Lib.temporalBucket(column);
      const bucketName = bucket
        ? Lib.displayInfo(query, 0, bucket).shortName
        : null;
      const columnDetails = column && {
        name: Lib.displayInfo(query, -1, column).name,
        binning: bucketName,
      };

      return {
        name: aggDisplay.name,
        column: columnDetails,
      };
    });

    onChange({
      ...value,
      values: aggDetails,
    } as ColumnNameAndBinningSplitSetting);
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

  const onRemoveAggregation = (
    partition: keyof PivotTableColumnSplitSetting,
    index: number,
  ) => {
    if (!aggregatedColumns) {
      return;
    }

    const updated = aggregatedColumns
      .filter((col) => col.aggregation_index !== index)
      .map((col) => {
        // Adjust aggregation_index of columns that came after the removed index
        if (col.aggregation_index != null && col.aggregation_index > index) {
          return { ...col, aggregation_index: col.aggregation_index - 1 };
        }
        return col;
      });

    setPendingAggCols(updated);
    onChange({
      ...value,
      [partition]: columnRemove(value[partition], index),
    });
  };

  const emptyColumnMessage = canEditColumns
    ? t`Add fields here`
    : t`Drag fields here`;

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      {partitions.map(({ name: partitionName, title }) => {
        const updatedColumns = updatedValue[partitionName] ?? [];
        const partitionType = getPartitionType(partitionName);
        const AggregationOrBreakoutPopover =
          partitionType === "metric" ? (
            <AddAggregationPopover
              query={aggregatedQuery}
              onAddAggregation={onAddAggregation}
            />
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
              renderClone={(provided, _snapshot, rubric) => {
                const col = updatedColumns[rubric.source.index];
                if (col) {
                  return (
                    <Box
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      mb="0.5rem"
                    >
                      <Column
                        onEditFormatting={handleEditFormatting}
                        column={col}
                        title={getColumnTitle(col)}
                      />
                    </Box>
                  );
                } else {
                  return (
                    <Box
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      mb="0.5rem"
                    ></Box>
                  );
                }
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
                      {emptyColumnMessage}
                    </Box>
                  ) : (
                    updatedColumns.map((val, index: number) => {
                      const col = val as RemappingHydratedDatasetColumn;
                      if (partitionType === "dimension") {
                        return (
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
                        );
                      } else if (partitionType === "metric") {
                        if (col) {
                          return (
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
                                      onRemoveAggregation(partitionName, index)
                                    }
                                    title={col.display_name}
                                  />
                                </Box>
                              )}
                            </Draggable>
                          );
                        }
                      }
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
    onRemove={() => onRemove?.()}
    removeIcon="close"
    draggable
    className={CS.m0}
  />
);
