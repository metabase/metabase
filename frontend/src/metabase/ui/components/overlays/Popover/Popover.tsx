import type { PopoverProps } from "@mantine/core";
import { Popover as MantinePopover } from "@mantine/core";
import { PopoverDropdown } from "./PopoverDropdown";

export function Popover(props: PopoverProps) {
  return <MantinePopover {...props} />;
}

Popover.Target = MantinePopover.Target;
Popover.Dropdown = PopoverDropdown;
