import { Popover } from "@mantine/core";
import type { PopoverDropdownProps } from "@mantine/core";

export type { PopoverBaseProps, PopoverProps } from "@mantine/core";
export { getPopoverOverrides } from "./Popover.styled";

const MantinePopoverDropdown = Popover.Dropdown;

const PopoverDropdown = Object.assign(function PopoverDropdown(
  props: PopoverDropdownProps,
) {
  return <MantinePopoverDropdown {...props} data-popover="mantine-popover" />;
},
MantinePopoverDropdown);

Popover.Dropdown = PopoverDropdown as typeof MantinePopoverDropdown;

export { Popover };
