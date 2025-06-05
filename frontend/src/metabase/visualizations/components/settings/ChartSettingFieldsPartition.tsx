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
import { MetabaseApi } from "metabase/services";
import { Box, Button, Flex, Icon, Popover, Text } from "metabase/ui";
import type { RemappingHydratedDatasetColumn } from "metabase/visualizations/types";
import type { Partition } from "metabase/visualizations/visualizations/PivotTable/partitions";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import type {
  ColumnNameColumnSplitSetting,
  DatasetColumn,
  NativeColumnSplit,
  NativeColumnSplitSetting,
  PartitionName,
  SplitSettingValue,
} from "metabase-types/api";

import { ColumnItem } from "./ColumnItem";

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

const columnMove = (columns: SplitSettingValue[], from: number, to: number) => {
  const columnCopy = [...columns];
  columnCopy.splice(to, 0, columnCopy.splice(from, 1)[0]);
  return columnCopy;
};

const columnRemove = (columns: SplitSettingValue[], from: number) => {
  return splice(columns, from, 1);
};

const columnAdd = (
  columns: SplitSettingValue[],
  to: number,
  column: SplitSettingValue,
) => {
  return splice(columns, to, 0, column);
};

type ChartSettingsFieldPartitionProps = {
  value: ColumnNameColumnSplitSetting | NativeColumnSplitSetting;
  onChange: (
    value: ColumnNameColumnSplitSetting | NativeColumnSplitSetting,
  ) => void;
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
  columns: RemappingHydratedDatasetColumn[];
  question: Question;
  partitions: Partition[];
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
}: ChartSettingsFieldPartitionProps) => {
  const isNativeQuery = question.datasetQuery()?.type === "native";
  const query = question.query();
  const datasetQuery = question.datasetQuery();

  const updatedValue = useMemo(
    () =>
      _.mapObject(value || {}, (splitVal: SplitSettingValue[]) => {
        if (isNativeQuery) {
          const aggDetails = splitVal as NativeColumnSplit[];
          return aggDetails.map(({ name, _column }) => {
            const col = columns.find((c) => c.name === name);
            if (!col) {
              console.warn(`Column ${name} not found in columns list`);
              return null;
            }
            return col;
          });
        }

        const columnNames = splitVal as string[];
        return columnNames
          .map((columnName: string) =>
            columns.find((col) => col.name === columnName),
          )
          .filter((col): col is RemappingHydratedDatasetColumn => col != null);
      }),
    [columns, value, isNativeQuery],
  );

  // TODO: figure out the right way to do this API call
  const [baseMetadataResults, setMetadataResults] = useState(null);
  useEffect(() => {
    // We have to execute the base query to get the metadata, so that we know what aggregations and breakouts are available
    MetabaseApi.dataset(datasetQuery)
      .then((resp) => setMetadataResults(resp.data.results_metadata.columns))
      .catch((err) => {
        console.error("Failed to fetch metadata", err);
      });
  }, [datasetQuery]);

  if (!baseMetadataResults) {
    return;
  }

  const wrappedQuery = Lib.wrapAdhocNativeQuery(query, baseMetadataResults);

  const onAddAggregation = (query: Lib.Query) => {
    const aggs = Lib.aggregations(query, -1);
    const aggDetails = aggs.map((agg) => {
      const aggDisplay = Lib.displayInfo(query, -1, agg);
      const column = Lib.aggregationColumn(query, -1, agg);
      const bucket = column ? Lib.temporalBucket(column) : undefined;
      const bucketName = bucket
        ? Lib.displayInfo(query, 0, bucket)?.shortName
        : undefined;
      const columnName = column
        ? Lib.displayInfo(query, -1, column).name
        : undefined;

      return {
        name: aggDisplay.name,
        column: columnName,
        bucket: bucketName,
      };
    });

    onChange({
      ...value,
      values: aggDetails,
    });
  };

  const onAddBreakout = (
    partition: "rows" | "columns",
    column: Lib.ColumnMetadata,
  ) => {
    const columnName = Lib.displayInfo(query, -1, column).name;

    // Lib.columnKey

    const bucket = Lib.temporalBucket(column);
    const bucketName = bucket
      ? Lib.displayInfo(query, 0, bucket)?.shortName
      : undefined;
    const binning = Lib.binning(column);
    const binningName = binning
      ? Lib.displayInfo(query, 0, binning)?.shortName
      : undefined;

    onChange({
      ...value,
      [partition]: columnAdd(
        value[partition] || [],
        value[partition]?.length ?? 0,
        {
          name: columnName,
          bucket: bucketName,
          binning: binningName,
        },
      ),
    });
  };

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
  };

  const emptyColumnMessage = canEditColumns
    ? t`Add fields here`
    : t`Drag fields here`;

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      {partitions.map(({ name: partitionName, title }) => {
        const updatedColumns = updatedValue[partitionName] ?? [];
        const partitionType = getPartitionType(partitionName);

        const AggregationPopover =
          partitionType === "metric" ? (
            <AddAggregationPopover
              query={wrappedQuery}
              onAddAggregation={onAddAggregation}
            />
          ) : (
            <AddBreakoutPopover
              query={wrappedQuery}
              onAddBreakout={(col) =>
                onAddBreakout(partitionName as "rows" | "columns", col)
              }
            />
          );

        return (
          <Box py="sm" key={partitionName}>
            <Flex align="center" justify="space-between">
              <Text c="text-medium">{title}</Text>
              {canEditColumns && AggregationPopover}
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
                      {emptyColumnMessage}
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
