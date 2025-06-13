import { useDisclosure } from "@mantine/hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import * as Pivot from "cljs/metabase.pivot.js";
import { AggregationPicker } from "metabase/common/components/AggregationPicker";
import { isNotNull } from "metabase/lib/types";
import { BreakoutPopover } from "metabase/querying/notebook/components/BreakoutStep";
import { MetabaseApi } from "metabase/services";
import { Button, Icon, Popover } from "metabase/ui";
import type { RemappingHydratedDatasetColumn } from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type {
  NativeSplitAggregationEntry,
  NativeSplitGroupEntry,
  PartitionName,
} from "metabase-types/api";

import {
  ChartSettingFieldsPartition,
  type ChartSettingFieldsPartitionProps,
  columnAdd,
} from "./ChartSettingFieldsPartition";

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

interface ChartSettingsNativeFieldPartitionProps
  extends ChartSettingFieldsPartitionProps<
    NativeSplitGroupEntry,
    NativeSplitAggregationEntry
  > {
  question: Question;
}

export const ChartSettingNativeFieldsPartition = ({
  value,
  onChange,
  question,
  columns,
  ...props
}: ChartSettingsNativeFieldPartitionProps) => {
  const query = question.query();
  const datasetQuery = question.datasetQuery();

  // const [pivotedQuery, setPivotedQuery] = useState<Lib.Query | null>(null);

  // TODO: use RTK query instead
  const [baseMetadataResults, setMetadataResults] = useState(null);
  useEffect(() => {
    // We have to execute the base query to get the metadata, so that we know what aggregations and breakouts are available
    MetabaseApi.dataset(datasetQuery)
      .then((resp) => setMetadataResults(resp.data.results_metadata.columns))
      .catch((err) => {
        console.error("Failed to fetch metadata", err);
      });
  }, [datasetQuery]);

  const nonPivotGroupingColumns: RemappingHydratedDatasetColumn[] =
    useMemo(() => {
      return Pivot.columns_without_pivot_group(columns);
    }, [columns]);

  const findColumnByEntry = useCallback(
    (
      _entry: NativeSplitGroupEntry | NativeSplitAggregationEntry,
      partition: PartitionName,
      index: number,
    ) => {
      if (partition === "values") {
        const aggregations = nonPivotGroupingColumns.filter(
          (col) => col.source === "aggregation",
        );
        return aggregations[index];
      }
      if (partition === "rows" || partition === "columns") {
        const breakouts = nonPivotGroupingColumns.filter(
          (col) => col.source === "breakout",
        );
        const breakoutIndex =
          index + (partition === "rows" ? 0 : value.rows.length);
        return breakouts[breakoutIndex];
      }
    },
    [nonPivotGroupingColumns, value],
  );

  if (!baseMetadataResults) {
    return;
  }

  const wrappedBaseQuery = Lib.wrapAdhocNativeQuery(query, baseMetadataResults);

  const handleAddAggregation = (query: Lib.Query) => {
    const aggs = Lib.aggregations(query, -1);
    const aggDetails = aggs
      .map((agg, i) => {
        const aggDisplay = Lib.displayInfo(query, -1, agg);
        const column = Lib.aggregationColumn(query, -1, agg);

        if (!column) {
          return null;
        }
        const columnName = Lib.columnKey(column);

        return {
          name: aggDisplay.name,
          index: i,
          column: columnName,
        };
      })
      .filter(isNotNull);

    // setPivotedQuery(query);
    onChange({
      ...value,
      values: [...aggDetails],
    });
  };

  const handleAddBreakout = (
    partition: "rows" | "columns",
    column: Lib.ColumnMetadata,
  ) => {
    const columnName = Lib.columnKey(column);
    const bucket = Lib.temporalBucket(column);
    const bucketName = bucket
      ? Lib.displayInfo(query, 0, bucket)?.shortName
      : undefined;

    const binning = Lib.binning(column);
    const binningInfo = binning
      ? Lib.displayInfo(query, 0, binning)
      : undefined;

    // const newPivotedQuery = Lib.breakout(wrappedBaseQuery, -1, column);
    // setPivotedQuery(newPivotedQuery);

    const existingBreakoutCount =
      value["rows"]?.length ?? 0 + value["columns"]?.length ?? 0;
    onChange({
      ...value,
      [partition]: columnAdd(
        value[partition] || [],
        value[partition]?.length ?? 0,
        {
          name: columnName,
          index: existingBreakoutCount,
          bucket: bucketName,
          binning: binningInfo,
        },
      ),
    });
  };

  return (
    <ChartSettingFieldsPartition
      {...props}
      emptySectionText={t`Add fields here`}
      value={value}
      onChange={onChange}
      columns={columns}
      canRemoveColumns
      getColumn={findColumnByEntry}
      renderAddColumnButton={(partitionName) =>
        partitionName === "values" ? (
          <AddAggregationPopover
            query={wrappedBaseQuery}
            onAddAggregation={handleAddAggregation}
          />
        ) : (
          <AddBreakoutPopover
            query={wrappedBaseQuery}
            onAddBreakout={(col) => handleAddBreakout(partitionName, col)}
          />
        )
      }
    />
  );
};
