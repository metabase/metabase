import { type Ref, forwardRef, useMemo } from "react";
import { t } from "ttag";

import { Flex, Select, Text } from "metabase/ui";

import { COLUMN_TYPE_INFO } from "../../constants";
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
      itemComponent={ColumnTypeItem}
      onChange={handleChange}
    />
  );
}

type ColumnTypeItemProps = {
  value: ColumnType;
  label: string;
  selected: boolean;
};

const ColumnTypeItem = forwardRef(function SelectItem(
  { value, label, selected, ...props }: ColumnTypeItemProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <div ref={ref} {...props}>
      <Flex justify="space-between" gap="md">
        <Text color="inherit">{label}</Text>
        <Text color={selected ? "inherit" : "text-light"}>
          {COLUMN_TYPE_INFO[value].example}
        </Text>
      </Flex>
    </div>
  );
});
