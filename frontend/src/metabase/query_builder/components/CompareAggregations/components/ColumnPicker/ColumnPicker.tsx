import type { ComponentPropsWithoutRef } from "react";
import { forwardRef, useCallback } from "react";
import { t } from "ttag";

import { Checkbox, Flex, MultiSelect, Text } from "metabase/ui";

import type { ColumnType } from "../../types";

import S from "./ColumnPicker.module.css";

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
      data={COLUMN_OPTIONS}
      data-testid="column-picker"
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
  ItemType & ComponentPropsWithoutRef<"div"> & { selected: boolean }
>(function Item({ example, label, selected, value, ...props }, ref) {
  return (
    <div data-testid="column-picker-item" ref={ref} {...props}>
      <Flex align="center" gap="sm">
        <Checkbox checked={selected} readOnly />

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
