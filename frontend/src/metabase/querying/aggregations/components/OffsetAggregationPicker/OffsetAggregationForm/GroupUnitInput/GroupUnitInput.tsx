import { useMemo } from "react";
import { t } from "ttag";

import { Select } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type { TemporalUnit } from "metabase-types/api";

import { getGroupUnitOptions } from "../../utils";

type GroupUnitInputProps = {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  groupUnit: TemporalUnit;
  onGroupUnitChange: (groupUnit: TemporalUnit) => void;
};

export function GroupUnitInput({
  query,
  stageIndex,
  column,
  groupUnit,
  onGroupUnitChange,
}: GroupUnitInputProps) {
  const groupOptions = useMemo(
    () => getGroupUnitOptions(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const handleChange = (newValue: string) => {
    const newOption = groupOptions.find(option => option.value === newValue);
    if (newOption) {
      onGroupUnitChange(newOption.value);
    }
  };

  return (
    <Select
      data={groupOptions}
      value={groupUnit}
      label={t`Group by`}
      w="14rem"
      onChange={handleChange}
    />
  );
}
