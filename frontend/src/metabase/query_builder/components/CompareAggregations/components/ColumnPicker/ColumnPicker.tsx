import type { ComponentPropsWithoutRef } from "react";
import { forwardRef, useCallback, useMemo } from "react";
import { t } from "ttag";

import { Checkbox, Flex, MultiSelect, Text } from "metabase/ui";

import type { ColumnType } from "../../types";

import S from "./ColumnPicker.module.css";

interface ItemType {
  example: string;
  isSelected: boolean;
  label: string;
  value: ColumnType;
}

interface Props {
  value: ColumnType[];
  onChange: (value: ColumnType[]) => void;
}

const COLUMN_OPTIONS: Omit<ItemType, "isSelected">[] = [
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

  const options = useMemo(() => {
    return COLUMN_OPTIONS.map(option => ({
      ...option,
      isSelected: value.includes(option.value),
    }));
  }, [value]);

  return (
    <MultiSelect
      data={options}
      disableSelectedItemFiltering
      itemComponent={Item}
      label={t`Columns to create`}
      placeholder={t`Columns to create`}
      styles={{
        item: {
          "&[data-selected]": {
            backgroundColor: "transparent",
          },
          "&[data-selected]:hover": {
            backgroundColor: "var(--mb-color-brand-lighter)",
          },
          "&[data-selected][data-hovered]": {
            backgroundColor: "var(--mb-color-brand-lighter)",
          },
          "&[data-hovered]": {
            backgroundColor: "var(--mb-color-brand-lighter)",
          },
        },
      }}
      value={value}
      onChange={handleChange}
    />
  );
};

const Item = forwardRef<
  HTMLDivElement,
  ItemType & ComponentPropsWithoutRef<"div">
>(function SelectItem({ example, isSelected, label, value, ...props }, ref) {
  return (
    <div ref={ref} {...props}>
      <Flex align="center" gap="sm">
        <Checkbox checked={isSelected} readOnly />

        <Flex align="center" className={S.itemContent} justify="space-between">
          <Text>{label}</Text>
          <Text c="text-light" size="sm">
            {example}
          </Text>
        </Flex>
      </Flex>
    </div>
  );
});
