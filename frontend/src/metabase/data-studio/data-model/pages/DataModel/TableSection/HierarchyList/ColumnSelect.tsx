import { Icon, Select, type SelectProps } from "metabase/ui";
import type { IconName } from "metabase-types/api";

export type ColumnOption = {
  value: string;
  label: string;
  icon: IconName;
  /** Options with a group are listed under it */
  group?: string;
};

// Half the form's 720px column: a column name doesn't need more
export const COLUMN_SELECT_MAX_WIDTH = 360;

type ColumnSelectProps = Omit<
  SelectProps,
  "data" | "value" | "onChange" | "leftSection"
> & {
  options: ColumnOption[];
  value: string | null;
  onChange: (value: string | null) => void;
};

/** A column picker that shows the picked column's type icon, as the field list does */
export function ColumnSelect({ options, value, ...props }: ColumnSelectProps) {
  const iconByValue = new Map(
    options.map((option) => [option.value, option.icon]),
  );
  const groups = [...new Set(options.map(({ group }) => group))];
  const toItem = ({ value, label }: ColumnOption) => ({ value, label });
  const data = groups.some((group) => group != null)
    ? groups.map((group) => ({
        group: group ?? "",
        items: options.filter((option) => option.group === group).map(toItem),
      }))
    : options.map(toItem);
  const selectedIcon = value != null ? iconByValue.get(value) : undefined;

  return (
    <Select
      maw={COLUMN_SELECT_MAX_WIDTH}
      {...props}
      data={data}
      value={value}
      leftSection={
        selectedIcon && <Icon name={selectedIcon} c="text-secondary" />
      }
    />
  );
}
