import { useMemo } from "react";
import { t } from "ttag";

import { Select } from "metabase/ui";

import type { ColumnType, ComparisonType } from "../../types";
import { getColumnTypeOptions } from "../../utils";

type ColumnTypeInputProps = {
  comparisonType: ComparisonType;
  columnType: ColumnType;
  onColumnTypeChange: (columnType: ColumnType) => void;
};

export function ColumnTypeInput({
  comparisonType,
  columnType,
  onColumnTypeChange,
}: ColumnTypeInputProps) {
  const options = useMemo(
    () => getColumnTypeOptions(comparisonType),
    [comparisonType],
  );

  const handleChange = (newValue: string) => {
    const newOption = options.find(option => option.value === newValue);
    if (newOption) {
      onColumnTypeChange(newOption.value);
    }
  };

  return (
    <Select
      data={options}
      value={columnType}
      label={t`Column to create`}
      onChange={handleChange}
    />
  );
}
