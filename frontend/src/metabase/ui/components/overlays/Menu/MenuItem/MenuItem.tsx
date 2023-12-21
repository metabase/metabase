import type { ButtonHTMLAttributes, MouseEvent } from "react";
import { Menu } from "@mantine/core";
import type { MenuItemProps as MantineMenuItemProps } from "@mantine/core";

type MenuItemProps = MantineMenuItemProps &
  ButtonHTMLAttributes<HTMLButtonElement>;

// hack to prevent parent Popover from closing when selecting a Menu.Item
// check useClickOutside hook in mantine
export function MenuItem(props: MenuItemProps) {
  const handleMouseDownCapture = (event: MouseEvent) => {
    event.nativeEvent.stopImmediatePropagation();
  };

  return <Menu.Item {...props} onMouseDownCapture={handleMouseDownCapture} />;
}
