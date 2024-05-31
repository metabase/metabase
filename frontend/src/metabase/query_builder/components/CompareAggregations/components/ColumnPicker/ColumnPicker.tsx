import type { ComponentPropsWithoutRef } from "react";
import { forwardRef, useCallback } from "react";
import { t } from "ttag";

import { Flex, MultiSelect, Text } from "metabase/ui";

import type { ColumnType } from "../../types";

interface ItemType {
  example: string;
  label: string;
  value: ColumnType;
}

interface Props {
  value: ColumnType[];
  onChange: (value: ColumnType[]) => void;
}

const COLUMN_OPTIONS: ItemType[] = [
  {
    example: "1826, 3004",
    label: t`Previous value`,
    value: "offset",
  },
  {
    example: "+2.3%, -0.1%",
    label: t`Percentage difference`,
    value: "percent-diff-offset",
  },
  {
    example: "+42, -3",
    label: t`Value difference`,
    value: "diff-offset",
  },
];

export const ColumnPicker = ({ value, onChange }: Props) => {
  const handleChange = useCallback(
    (values: string[]) => {
      onChange(values as ColumnType[]);
    },
    [onChange],
  );

  return (
    <MultiSelect
      label={t`Columns to create`}
      data={COLUMN_OPTIONS}
      itemComponent={Item}
      placeholder={t`Columns to create`}
      rightSection={null}
      value={value}
      onChange={handleChange}
    />
  );
};

const Item = forwardRef<
  HTMLDivElement,
  ItemType & ComponentPropsWithoutRef<"div">
>(function SelectItem({ example, label, ...props }, ref) {
  return (
    <div ref={ref} {...props}>
      <Flex align="center" justify="space-between">
        <Text>{label}</Text>
        <Text c="text-light" size="sm">
          {example}
        </Text>
      </Flex>
    </div>
  );
});
