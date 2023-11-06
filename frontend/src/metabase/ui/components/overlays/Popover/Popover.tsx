import type { PopoverProps } from "@mantine/core";
import { Popover as MantinePopover } from "@mantine/core";
import { PopoverDropdown } from "./PopoverDropdown";
import { PopoverTarget } from "./PopoverTarget";

export function Popover(props: PopoverProps) {
  return <MantinePopover {...props} />;
}

Popover.Target = PopoverTarget;
Popover.Dropdown = PopoverDropdown;
