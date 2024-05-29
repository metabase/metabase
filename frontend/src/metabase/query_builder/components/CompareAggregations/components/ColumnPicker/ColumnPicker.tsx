import type { ComponentPropsWithoutRef } from "react";
import { forwardRef, useCallback } from "react";
import { t } from "ttag";

import { Flex, MultiAutocomplete, Text } from "metabase/ui";

import type { ColumnType } from "../../types";

type ItemType = {
  example: string;
  label: string;
  value: ColumnType;
};

interface Props {
  value: ColumnType[];
  onChange: (value: ColumnType[]) => void;
}

const COLUMN_OPTIONS: ItemType[] = [
  {
    example: "1826, 3004",
    label: t`Previous value`,
    value: "offset" as const,
  },
  {
    example: "+2.3%, -0.1%",
    label: t`Percentage difference`,
    value: "percent-diff-offset" as const,
  },
  {
    example: "+42, -3",
    label: t`Value difference`,
    value: "diff-offset" as const,
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
    <MultiAutocomplete
      label={t`Columns to create`}
      data={COLUMN_OPTIONS}
      itemComponent={SelectItem}
      placeholder={t`Columns to create`}
      rightSection={null}
      shouldCreate={shouldCreate}
      value={value}
      onChange={handleChange}
    />
  );
};

const shouldCreate = () => false;

type ItemProps = ItemType & ComponentPropsWithoutRef<"div">;

const SelectItem = forwardRef<HTMLDivElement, ItemProps>(function SelectItem(
  { example, label, ...others }: ItemProps,
  ref,
) {
  return (
    <div ref={ref} {...others}>
      <Flex align="center" justify="space-between">
        <Text>{label}</Text>
        <Text c="text-light" size="sm">
          {example}
        </Text>
      </Flex>
    </div>
  );
});
