import { useDisclosure } from "@mantine/hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { AggregationPicker } from "metabase/common/components/AggregationPicker";
import { BreakoutPopover } from "metabase/querying/notebook/components/BreakoutStep";
import { MetabaseApi } from "metabase/services";
import { Button, Icon, Popover } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type {
  DatasetQuery,
  NativeSplitAggregationEntry,
  NativeSplitGroupEntry,
  VisualizationSettings,
} from "metabase-types/api";

import {
  ChartSettingFieldsPartition,
  type ChartSettingFieldsPartitionProps,
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
  settings: VisualizationSettings;
  onChangeSettings: (settings: VisualizationSettings) => void;
}

export const ChartSettingNativeFieldsPartition = ({
  value,
  onChange,
  question,
  columns,
  settings,
  onChangeSettings,
  ...props
}: ChartSettingsNativeFieldPartitionProps) => {
  const baseQuery = question.query();
  const query = question.query();
  const datasetQuery = question.datasetQuery();

  const pivotedQuery = useMemo(() => {
    const pivotedQuery = Lib.toLegacyQuery(Lib.appendStage(baseQuery));
    const aggregationStage = settings["pivot_table.aggregation_stage"];
    const metadataProvider = Lib.metadataProvider(
      datasetQuery.database,
      question.metadata(),
    );
    return Lib.fromLegacyQuery(pivotedQuery.database, metadataProvider, {
      ...pivotedQuery,
      query: {
        ...pivotedQuery.query,
        ...aggregationStage,
      },
    });
  }, [baseQuery, datasetQuery.database, question, settings]);

  console.log(">>pivotedQuery", Lib.toLegacyQuery(pivotedQuery));

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

  const flatOrderedEntries = useMemo(
    () => [...value.values, ...value.rows, ...value.columns],
    [value],
  );

  const flatDeduplicatedColumnNames = useMemo(() => {
    return Lib.uniqueNames(flatOrderedEntries.map((c) => c.name));
  }, [flatOrderedEntries]);

  const findColumnByEntry = useCallback(
    (entry: NativeSplitGroupEntry | NativeSplitAggregationEntry) => {
      const entryIndex = flatOrderedEntries.indexOf(entry);
      const deduplicatedColumnName = flatDeduplicatedColumnNames[entryIndex];
      return columns.find((c) => c.name === deduplicatedColumnName);
    },
    [columns, flatDeduplicatedColumnNames, flatOrderedEntries],
  );

  if (!baseMetadataResults) {
    return;
  }

  const wrappedQuery = Lib.wrapAdhocNativeQuery(query, baseMetadataResults);

  const updateAggregationStage = (query: DatasetQuery) => {
    const aggregationStage = _.pick(query.query, [
      "aggregation",
      "aggregation-idents",
      "breakout",
      "breakout-idents",
    ]);

    onChangeSettings({ "pivot_table.aggregation_stage": aggregationStage });
  };

  const handleAddAggregation = (query: Lib.Query) => {
    // We are adding the aggregation to pre-pivoted query therefore it will be the only aggregation
    const addedAggregation = Lib.aggregations(query, -1)[0];

    const newPivotedQuery = Lib.toLegacyQuery(
      // We need to reliably get the post-aggregation column name back to use it in the split setting.
      // Using just an aggregation function or the column name from `query` results would be wrong as the name in the post-aggregated pivoted dataset can change due to name collisions
      Lib.aggregate(pivotedQuery, -1, addedAggregation),
    );
    updateAggregationStage(newPivotedQuery);

    // onChange({
    //   ...value,
    //   values: [...value.values, ...aggDetails],
    // });
  };

  const handleAddBreakout = (
    partition: "rows" | "columns",
    column: Lib.ColumnMetadata,
  ) => {
    const newPivotedQuery = Lib.toLegacyQuery(
      Lib.breakout(pivotedQuery, -1, column),
    );
    updateAggregationStage(newPivotedQuery);

    // onChange({
    //   ...value,
    //   [partition]: columnAdd(
    //     value[partition] || [],
    //     value[partition]?.length ?? 0,
    //     {
    //       name: columnName,
    //       bucket: bucketName,
    //       binning: binningInfo,
    //     },
    //   ),
    // });
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
            query={wrappedQuery}
            onAddAggregation={handleAddAggregation}
          />
        ) : (
          <AddBreakoutPopover
            query={pivotedQuery}
            onAddBreakout={(col) => handleAddBreakout(partitionName, col)}
          />
        )
      }
    />
  );
};
