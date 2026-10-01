import { Menu, Text } from "metabase/ui";
import { formatValue } from "metabase/value-formatting";
import type { ColumnSettings } from "metabase-types/api";

type Props = {
  formatOptions: ColumnSettings | undefined;
  label: string;
  resolvedValue: number | null;
  selected: boolean;
  onClick: () => void;
};

export function GoalColumnMenuItem({
  formatOptions,
  selected,
  label,
  resolvedValue,
  onClick,
}: Props) {
  return (
    <Menu.Item
      bg={selected ? "background-selected" : undefined}
      lh="1rem"
      rightSection={
        resolvedValue != null ? (
          <Text c="text-secondary" fz="md" lh="1rem">
            {formatValue(resolvedValue, formatOptions)}
          </Text>
        ) : undefined
      }
      onClick={onClick}
    >
      {label}
    </Menu.Item>
  );
}
