import type { ComponentPropsWithoutRef } from "react";
import { forwardRef, useCallback } from "react";
import { useDeepCompareEffect } from "react-use";
import { t } from "ttag";

import { Checkbox, Flex, MultiSelect, Text } from "metabase/ui";

import type { ColumnType, ComparisonType } from "../../types";

import S from "./ColumnPicker.module.css";

interface ItemType {
  example: string;
  label: string;
  value: ColumnType;
}

interface Props {
  comparisonType: ComparisonType;
  value: ColumnType[];
  onChange: (value: ColumnType[]) => void;
}

export const ColumnPicker = ({ value, onChange, comparisonType }: Props) => {
  const handleChange = useCallback(
    (values: string[]) => {
      onChange(values as ColumnType[]);
    },
    [onChange],
  );

  useDeepCompareEffect(() => {
    onChange(convertValues(value, comparisonType));
  }, [value, onChange, comparisonType]);

  return (
    <MultiSelect
      data={getColumnOptions(comparisonType)}
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

function getColumnOptions(comparisonType: string): ItemType[] {
  if (comparisonType === "offset") {
    return [
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
  }
  if (comparisonType === "moving-average") {
    return [
      {
        example: "1826, 3004",
        label: t`Moving average value`,
        value: "moving-average",
      },
      {
        example: "+2.3%, -0.1%",
        label: t`Percentage difference with moving average`,
        value: "percent-diff-moving-average",
      },
      {
        example: "+42, -3",
        label: t`Value difference with moving average`,
        value: "diff-moving-average",
      },
    ];
  }
  return [];
}

const comparisonTypeMapping = {
  offset: {
    offset: "offset",
    "diff-offset": "diff-offset",
    "percent-diff-offset": "percent-diff-offset",
    "moving-average": "offset",
    "diff-moving-average": "diff-offset",
    "percent-diff-moving-average": "percent-diff-offset",
  },
  "moving-average": {
    offset: "moving-average",
    "diff-offset": "diff-moving-average",
    "percent-diff-offset": "percent-diff-moving-average",
    "moving-average": "moving-average",
    "diff-moving-average": "diff-moving-average",
    "percent-diff-moving-average": "percent-diff-moving-average",
  },
} as const;

function convertValues(
  values: ColumnType[],
  comparisonType: ComparisonType,
): ColumnType[] {
  return values.map(value => comparisonTypeMapping[comparisonType][value]);
}
