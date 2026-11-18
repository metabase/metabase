import cx from "classnames";

import type { MenuItemProps } from "metabase/ui";
import { Menu } from "metabase/ui";

import S from "./ComparisonMenuItem.module.css";

type ComparisonMenuItemProps = MenuItemProps &
  React.HTMLAttributes<HTMLButtonElement>;

export const ComparisonMenuItem = (props: ComparisonMenuItemProps) => {
  const isSelected = props["aria-selected"];

  return (
    <Menu.Item
      {...props}
      className={cx(props.className, { [S.isSelected]: isSelected })}
    />
  );
};
