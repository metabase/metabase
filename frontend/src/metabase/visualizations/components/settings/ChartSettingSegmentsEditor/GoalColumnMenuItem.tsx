import cx from "classnames";

import { Menu, Text } from "metabase/ui";
import { formatValue } from "metabase/visualizations/lib/formatting";

import S from "./GoalValueInput.module.css";

export type GoalColumnMenuItemProps = {
  label: string;
  resolvedValue: number | null;
  isSelected: boolean;
  onClick: () => void;
};

/** One column of a goal's source, with the value it currently resolves to. */
export function GoalColumnMenuItem({
  label,
  resolvedValue,
  isSelected,
  onClick,
}: GoalColumnMenuItemProps) {
  return (
    <Menu.Item
      className={cx({ [S.selectedItem]: isSelected })}
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
