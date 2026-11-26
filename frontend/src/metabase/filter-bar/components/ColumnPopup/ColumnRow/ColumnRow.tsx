import { match } from "ts-pattern";

import { Icon, Menu } from "metabase/ui";

import { type ListRow, getItemDisplay } from "../utils";

type ColumnRowProps<F> = {
  row: ListRow<F>;
  isFirst: boolean;
  isActive: boolean;
  onHover: () => void;
  onClick: () => void;
};

export const ColumnRow = <F,>({
  row,
  isFirst,
  isActive,
  onHover,
  onClick,
}: ColumnRowProps<F>) =>
  match(row)
    .with({ type: "group" }, ({ group, isCollapsed }) => (
      <>
        {!isFirst && <Menu.Divider />}
        <Menu.Item
          fw="bold"
          aria-selected={isActive}
          aria-expanded={!isCollapsed}
          leftSection={<Icon name={group.icon} />}
          rightSection={
            <Icon
              name={isCollapsed ? "chevronright" : "chevrondown"}
              size={12}
            />
          }
          onMouseEnter={onHover}
          onClick={onClick}
        >
          {group.label}
        </Menu.Item>
      </>
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
