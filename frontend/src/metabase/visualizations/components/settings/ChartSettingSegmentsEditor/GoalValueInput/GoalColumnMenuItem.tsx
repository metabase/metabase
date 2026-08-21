import { Menu, Text } from "metabase/ui";
import { formatValue } from "metabase/visualizations/lib/formatting";

type Props = {
  label: string;
  resolvedValue: number | null;
  selected: boolean;
  onClick: () => void;
};

export function GoalColumnMenuItem({
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
