import cx from "classnames";

import type { MenuItemProps } from "metabase/ui";
import { Menu } from "metabase/ui";

import S from "./MenuItem.module.css";

type MenuItemStyledProps = MenuItemProps &
  React.HTMLAttributes<HTMLButtonElement>;

export const MenuItemStyled = (props: MenuItemStyledProps) => {
  const isSelected = props["aria-selected"];

  return (
    <Menu.Item
      {...props}
      className={cx(props.className, { [S.isSelected]: isSelected })}
    />
  );
};
