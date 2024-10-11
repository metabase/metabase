import { useMemo, useState } from "react";
import { t } from "ttag";

import { Button, Stack } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type { TemporalUnit } from "metabase-types/api";

import type { ComparisonType, OffsetData } from "../types";
import { getBreakoutColumn, getInitialData } from "../utils";

import { ComparisonTypeInput } from "./ComparisonTypeInput";
import { GroupUnitInput } from "./GroupUnitInput";

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
  const [options, setOptions] = useState<OffsetData>(() =>
    getInitialData(query, stageIndex, column),
  );

  const handleComparisonTypeChange = (comparisonType: ComparisonType) => {
    setOptions(options => ({ ...options, comparisonType }));
  };

  const handleGroupUnitChange = (groupUnit: TemporalUnit) => {
    setOptions(options => ({
      ...options,
      groupUnit,
      offsetUnit: groupUnit,
    }));
  };

  return (
    <form>
      <Stack>
        <ComparisonTypeInput
          value={options.comparisonType}
          onChange={handleComparisonTypeChange}
        />
        <GroupUnitInput
          query={query}
          stageIndex={stageIndex}
          column={column}
          value={options.groupUnit}
          onChange={handleGroupUnitChange}
        />
        <Button variant="filled" type="submit">{t`Done`}</Button>
      </Stack>
    </form>
  );
}
