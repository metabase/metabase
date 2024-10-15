import { useMemo } from "react";

import { Select } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type { TemporalUnit } from "metabase-types/api";

import { getOffsetUnitOptions, getOffsetUnits } from "../../utils";

type OffsetUnitInputProps = {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  groupUnit: TemporalUnit;
  offsetUnit: TemporalUnit;
  offsetValue: number;
  onOffsetUnitChange: (offsetUnit: TemporalUnit) => void;
};

export function OffsetUnitInput({
  query,
  stageIndex,
  column,
  groupUnit,
  offsetUnit,
  offsetValue,
  onOffsetUnitChange,
}: OffsetUnitInputProps) {
  const offsetUnits = useMemo(
    () => getOffsetUnits(query, stageIndex, column, groupUnit),
    [query, stageIndex, column, groupUnit],
  );

  const offsetOptions = useMemo(
    () => getOffsetUnitOptions(offsetUnits, offsetValue),
    [offsetUnits, offsetValue],
  );

  const handleChange = (newValue: string) => {
    const newOption = offsetOptions.find(option => option.value === newValue);
    if (newOption) {
      onOffsetUnitChange(newOption.value);
    }
  };

  return (
    <Select
      data={offsetOptions}
      value={offsetUnit}
      w="10rem"
      onChange={handleChange}
    />
  );
}
