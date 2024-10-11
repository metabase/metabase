import { type FormEvent, useMemo, useState } from "react";
import { t } from "ttag";

import { Button, Flex, Group, Input, Stack } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type { TemporalUnit } from "metabase-types/api";

import type { ColumnType, ComparisonType, OffsetOptions } from "../types";
import {
  applyOffset,
  getBreakoutColumn,
  getInitialOptions,
  getOffsetClause,
} from "../utils";

import { ColumnTypeInput } from "./ColumnTypeInput";
import { ComparisonTypeInput } from "./ComparisonTypeInput";
import { GroupUnitInput } from "./GroupUnitInput";
import { IncludeCurrentInput } from "./IncludeCurrentInput";
import { OffsetLabel } from "./OffsetLabel";
import { OffsetUnitInput } from "./OffsetUnitInput";
import { OffsetValueInput } from "./OffsetValueInput";

type OffsetAggregationFormProps = {
  query: Lib.Query;
  stageIndex: number;
  aggregation: Lib.AggregationClause;
  onSubmit: (query: Lib.Query, aggregations: Lib.ExpressionClause[]) => void;
};

export function OffsetAggregationForm({
  query,
  stageIndex,
  aggregation,
  onSubmit,
}: OffsetAggregationFormProps) {
  const column = useMemo(
    () => getBreakoutColumn(query, stageIndex),
    [query, stageIndex],
  );
  const [options, setOptions] = useState<OffsetOptions>(() =>
    getInitialOptions(query, stageIndex, column),
  );

  const handleComparisonTypeChange = (comparisonType: ComparisonType) => {
    setOptions(options => ({ ...options, comparisonType }));
  };

  const handleColumnTypeChange = (columnType: ColumnType) => {
    setOptions(options => ({ ...options, columnType }));
  };

  const handleGroupUnitChange = (groupUnit: TemporalUnit) => {
    setOptions(options => ({
      ...options,
      groupUnit,
      offsetUnit: groupUnit,
    }));
  };

  const handleOffsetValueChange = (offsetValue: number) => {
    setOptions(options => ({ ...options, offsetValue }));
  };

  const handleOffsetUnitChange = (offsetUnit: TemporalUnit) => {
    setOptions(options => ({ ...options, offsetUnit }));
  };

  const handleIncludeCurrentChange = (includeCurrent: boolean) => {
    setOptions(options => ({ ...options, includeCurrent }));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const newClause = getOffsetClause(query, stageIndex, aggregation, options);
    const newQuery = applyOffset(query, stageIndex, column, newClause, options);
    onSubmit(newQuery, [newClause]);
  };

  return (
    <form onSubmit={handleSubmit}>
      <Stack spacing="lg">
        <ComparisonTypeInput
          comparisonType={options.comparisonType}
          onComparisonTypeChange={handleComparisonTypeChange}
        />
        <GroupUnitInput
          query={query}
          stageIndex={stageIndex}
          column={column}
          groupUnit={options.groupUnit}
          onGroupUnitChange={handleGroupUnitChange}
        />
        <Stack spacing="sm">
          <Input.Label>{t`Compare to`}</Input.Label>
          <Group spacing="sm">
            <OffsetValueInput
              comparisonType={options.comparisonType}
              offsetValue={options.offsetValue}
              onOffsetValueChange={handleOffsetValueChange}
            />
            <OffsetUnitInput
              query={query}
              stageIndex={stageIndex}
              column={column}
              groupUnit={options.groupUnit}
              offsetUnit={options.offsetUnit}
              onOffsetUnitChange={handleOffsetUnitChange}
            />
            <OffsetLabel comparisonType={options.comparisonType} />
          </Group>
          <IncludeCurrentInput
            offsetUnit={options.offsetUnit}
            includeCurrent={options.includeCurrent}
            onIncludeCurrentChange={handleIncludeCurrentChange}
          />
        </Stack>
        <ColumnTypeInput
          comparisonType={options.comparisonType}
          columnType={options.columnType}
          onColumnTypeChange={handleColumnTypeChange}
        />
        <Flex justify="end">
          <Button variant="filled" type="submit">{t`Done`}</Button>
        </Flex>
      </Stack>
    </form>
  );
}
