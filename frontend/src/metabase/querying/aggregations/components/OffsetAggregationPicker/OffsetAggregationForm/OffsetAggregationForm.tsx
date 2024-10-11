import { useMemo, useState } from "react";
import { t } from "ttag";

import { Box, Button, Group, Input, Stack } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type { TemporalUnit } from "metabase-types/api";

import type { ColumnType, ComparisonType, OffsetData } from "../types";
import { getBreakoutColumn, getInitialData } from "../utils";

import { ColumnTypeInput } from "./ColumnTypeInput";
import { ComparisonTypeInput } from "./ComparisonTypeInput";
import { GroupUnitInput } from "./GroupUnitInput";
import { OffsetUnitInput } from "./OffsetUnitInput";
import { OffsetValueInput } from "./OffsetValueInput";

type OffsetAggregationFormProps = {
  query: Lib.Query;
  stageIndex: number;
};

export function OffsetAggregationForm({
  query,
  stageIndex,
}: OffsetAggregationFormProps) {
  const column = useMemo(
    () => getBreakoutColumn(query, stageIndex),
    [query, stageIndex],
  );
  const [data, setData] = useState<OffsetData>(() =>
    getInitialData(query, stageIndex, column),
  );

  const handleComparisonTypeChange = (comparisonType: ComparisonType) => {
    setData(data => ({ ...data, comparisonType }));
  };

  const handleColumnTypeChange = (columnType: ColumnType) => {
    setData(data => ({ ...data, columnType }));
  };

  const handleGroupUnitChange = (groupUnit: TemporalUnit) => {
    setData(data => ({
      ...data,
      groupUnit,
      offsetUnit: groupUnit,
    }));
  };

  const handleOffsetValueChange = (offsetValue: number) => {
    setData(data => ({ ...data, offsetValue }));
  };

  const handleOffsetUnitChange = (offsetUnit: TemporalUnit) => {
    setData(data => ({ ...data, offsetUnit }));
  };

  return (
    <form>
      <Stack p="lg" spacing="lg">
        <ComparisonTypeInput
          comparisonType={data.comparisonType}
          onComparisonTypeChange={handleComparisonTypeChange}
        />
        <GroupUnitInput
          query={query}
          stageIndex={stageIndex}
          column={column}
          groupUnit={data.groupUnit}
          onGroupUnitChange={handleGroupUnitChange}
        />
        <Box>
          <Input.Label mb="sm">{t`Compare to`}</Input.Label>
          <Group spacing="sm">
            <OffsetValueInput
              comparisonType={data.comparisonType}
              offsetValue={data.offsetValue}
              onOffsetValueChange={handleOffsetValueChange}
            />
            <OffsetUnitInput
              query={query}
              stageIndex={stageIndex}
              column={column}
              groupUnit={data.groupUnit}
              offsetUnit={data.offsetUnit}
              onOffsetUnitChange={handleOffsetUnitChange}
            />
          </Group>
        </Box>
        <ColumnTypeInput
          comparisonType={data.comparisonType}
          columnType={data.columnType}
          onColumnTypeChange={handleColumnTypeChange}
        />
        <Button variant="filled" type="submit">{t`Done`}</Button>
      </Stack>
    </form>
  );
}
