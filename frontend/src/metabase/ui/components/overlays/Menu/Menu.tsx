import type { MenuProps } from "@mantine/core";
import { Menu as MantineMenu } from "@mantine/core";

import { useSelector } from "metabase/lib/redux";
import { getWritingDirection } from "metabase/selectors/app";

import { MenuDropdown } from "./MenuDropdown";
import { MenuItem } from "./MenuItem";

export function Menu(props: MenuProps) {
  let position = props.position;
  const writingDirection = useSelector(getWritingDirection);
  if (writingDirection === "rtl" && position === "bottom-start") {
    position = "bottom-end";
  }
  if (writingDirection === "rtl" && position === "bottom-end") {
    position = "bottom-start";
  }
  return <MantineMenu {...props} position={position} />;
}

Menu.Target = MantineMenu.Target;
Menu.Dropdown = MenuDropdown;
Menu.Item = MenuItem;
Menu.Label = MantineMenu.Label;
Menu.Divider = MantineMenu.Divider;
