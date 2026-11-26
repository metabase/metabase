import { match } from "ts-pattern";

import { Icon, Menu } from "metabase/ui";

import { type ListRow, getItemDisplay } from "../utils";

type ColumnRowProps<F> = {
  row: ListRow<F>;
  isActive: boolean;
  onHover: () => void;
  onClick: () => void;
};

export const ColumnRow = <F,>({
  row,
  isActive,
  onHover,
  onClick,
}: ColumnRowProps<F>) =>
  match(row)
    .with({ type: "group" }, ({ group, isCollapsed }) => (
      <Menu.Item
        fw="bold"
        mb={isCollapsed ? 0 : "sm"}
        aria-selected={isActive}
        aria-expanded={!isCollapsed}
        leftSection={<Icon name={group.icon} c="icon-brand" />}
        rightSection={
          <Icon name={isCollapsed ? "chevronright" : "chevrondown"} size={12} />
        }
        onMouseEnter={onHover}
        onClick={onClick}
      >
        {group.label}
      </Menu.Item>
    ))
    .with({ type: "section" }, ({ label }) => <Menu.Label>{label}</Menu.Label>)
    .with({ type: "item" }, ({ item }) => (
      <Menu.Item
        aria-selected={isActive}
        leftSection={<Icon name={getItemDisplay(item).icon} />}
        onMouseEnter={onHover}
        onClick={onClick}
      >
        {getItemDisplay(item).label}
      </Menu.Item>
    ))
    .exhaustive();
