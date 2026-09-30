import { Menu, Text } from "metabase/ui";
import type { GoalValueResult } from "metabase/viz-core";
import type { VisualizationSettings } from "metabase-types/api";

import { formatGoalValue } from "./utils";

type Props = {
  label: string;
  resolved: GoalValueResult;
  selected: boolean;
  visualizationSettings: VisualizationSettings | undefined;
  onClick: () => void;
};

export function GoalColumnMenuItem({
  label,
  resolved,
  selected,
  visualizationSettings,
  onClick,
}: Props) {
  const formattedValue = formatGoalValue(resolved, visualizationSettings);

  return (
    <Menu.Item
      bg={selected ? "background-selected" : undefined}
      lh="1rem"
      rightSection={
        formattedValue != null ? (
          <Text c="text-secondary" fz="md" lh="1rem">
            {formattedValue}
          </Text>
        ) : undefined
      }
      onClick={onClick}
    >
      {label}
    </Menu.Item>
  );
}
