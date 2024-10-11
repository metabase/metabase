import { useMemo } from "react";
import { t } from "ttag";

import { Select } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { TemporalUnit } from "metabase-types/api";

import { OFFSET_UNITS } from "../../constants";

type GroupUnitInputProps = {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  value: TemporalUnit;
  onChange: (value: TemporalUnit) => void;
};

export function GroupUnitInput({
  query,
  stageIndex,
  column,
  value,
  onChange,
}: GroupUnitInputProps) {
  const options = useMemo(
    () => getOptions(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const handleChange = (newValue: string) => {
    const newOption = options.find(option => option.value === newValue);
    if (newOption) {
      onChange(newOption.value);
    }
  };

  return (
    <Select
      data={options}
      value={value}
      label={t`Group by`}
      onChange={handleChange}
    />
  );
}

function getOptions(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
) {
  return Lib.availableTemporalBuckets(query, stageIndex, column)
    .map(bucket => Lib.displayInfo(query, stageIndex, bucket).shortName)
    .filter(unit => OFFSET_UNITS[unit])
    .map(unit => ({
      value: unit,
      label: Lib.describeTemporalUnit(unit),
    }));
}
