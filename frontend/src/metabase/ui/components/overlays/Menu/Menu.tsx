import type { MenuProps } from "@mantine/core";
import { Menu as MantineMenu } from "@mantine/core";

import { MenuItem } from "./MenuItem";

export function Menu(props: MenuProps) {
  return <MantineMenu {...props} />;
}

Menu.Target = MantineMenu.Target;
Menu.Dropdown = MantineMenu.Dropdown;
Menu.Item = MenuItem;
Menu.Label = MantineMenu.Label;
Menu.Divider = MantineMenu.Divider;
Menu.Sub = MantineMenu.Sub;
