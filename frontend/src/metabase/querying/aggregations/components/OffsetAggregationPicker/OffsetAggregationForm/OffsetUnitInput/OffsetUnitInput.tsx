import { useMemo } from "react";

import { Select } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type { TemporalUnit } from "metabase-types/api";

import { getOffsetUnitOptions } from "../../utils";

type OffsetUnitInputProps = {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  groupUnit: TemporalUnit;
  offsetUnit: TemporalUnit;
  onOffsetUnitChange: (offsetUnit: TemporalUnit) => void;
};

export function OffsetUnitInput({
  query,
  stageIndex,
  column,
  groupUnit,
  offsetUnit,
  onOffsetUnitChange,
}: OffsetUnitInputProps) {
  const options = useMemo(
    () => getOffsetUnitOptions(query, stageIndex, column, groupUnit),
    [query, stageIndex, column, groupUnit],
  );

  const handleChange = (newValue: string) => {
    const newOption = options.find(option => option.value === newValue);
    if (newOption) {
      onOffsetUnitChange(newOption.value);
    }
  };

  return (
    <Select
      data={options}
      value={offsetUnit}
      w="10rem"
      onChange={handleChange}
    />
  );
}
