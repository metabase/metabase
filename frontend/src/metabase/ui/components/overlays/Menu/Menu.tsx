import type { MenuProps } from "@mantine/core";
import { Menu as MantineMenu } from "@mantine/core";

import { Guard } from "../Guard";

import { MenuDropdown } from "./MenuDropdown";
import { MenuItem } from "./MenuItem";

export function Menu(props: MenuProps) {
  return (
    <Guard {...props}>
      <MantineMenu {...props} />
    </Guard>
  );
}

Menu.Target = MantineMenu.Target;
Menu.Dropdown = MenuDropdown;
Menu.Item = MenuItem;
Menu.Label = MantineMenu.Label;
Menu.Divider = MantineMenu.Divider;
