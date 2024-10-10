import { useMemo, useState } from "react";
import { t } from "ttag";

import { Button, Stack } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type { TemporalUnit } from "metabase-types/api";

import { ComparisonTypeInput } from "./ComparisonTypeInput";
import { GroupUnitInput } from "./GroupUnitInput";
import type { ComparisonType, OffsetOptions } from "./types";
import { getBreakoutColumn } from "./utils";

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
  const [options, setOptions] = useState<OffsetOptions>({
    comparisonType: "offset",
    groupUnit: "month",
  });

  const handleComparisonTypeChange = (comparisonType: ComparisonType) => {
    setOptions({ ...options, comparisonType });
  };

  const handleGroupUnitChange = (groupUnit: TemporalUnit) => {
    setOptions({ ...options, groupUnit });
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
