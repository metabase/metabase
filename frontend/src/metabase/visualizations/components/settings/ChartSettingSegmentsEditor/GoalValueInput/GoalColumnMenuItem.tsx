import { Menu, Text } from "metabase/ui";
import { formatValue } from "metabase/visualizations/lib/formatting";

type Props = {
  isSelected: boolean;
  label: string;
  resolvedValue: number | null;
  onClick: () => void;
};

export function GoalColumnMenuItem({
  isSelected,
  label,
  resolvedValue,
  onClick,
}: Props) {
  return (
    <Menu.Item
      bg={isSelected ? "background-selected" : undefined}
      rightSection={
        resolvedValue != null ? (
          <Text c="text-secondary" fz="md">
            {formatValue(resolvedValue)}
          </Text>
        ) : undefined
      }
      onClick={onClick}
    >
      {label}
    </Menu.Item>
  );
}
