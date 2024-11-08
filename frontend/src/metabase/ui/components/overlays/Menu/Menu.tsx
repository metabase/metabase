import type { MenuProps } from "@mantine/core";
import { Menu as MantineMenu } from "@mantine/core";

import { MenuDropdown } from "./MenuDropdown";
import { MenuItem } from "./MenuItem";
import { withLazyPortal } from "../utils";

export function Menu(props: MenuProps) {
  return <MantineMenu {...withLazyPortal(props)} />;
}

Menu.Target = MantineMenu.Target;
Menu.Dropdown = MenuDropdown;
Menu.Item = MenuItem;
Menu.Label = MantineMenu.Label;
Menu.Divider = MantineMenu.Divider;
