import { Menu, Text } from "metabase/ui";
import { formatValue } from "metabase/value-formatting";
import type { ColumnSettings } from "metabase-types/api";

type Props = {
  disabled?: boolean;
  formatOptions: ColumnSettings | undefined;
  label: string;
  resolvedValue: number | null;
  selected: boolean;
  onClick: () => void;
};

export function GoalColumnMenuItem({
  disabled,
  formatOptions,
  selected,
  label,
  resolvedValue,
  onClick,
}: Props) {
  return (
    <Menu.Item
      bg={selected ? "background_surface-selected" : undefined}
      disabled={disabled}
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
