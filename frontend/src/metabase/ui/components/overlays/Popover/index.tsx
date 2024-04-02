import type { PopoverDropdownProps } from "@mantine/core";
import { Popover } from "@mantine/core";

export type { PopoverBaseProps, PopoverProps } from "@mantine/core";
export { getPopoverOverrides } from "./Popover.styled";

const MantinePopoverDropdown = Popover.Dropdown;

const PopoverDropdown = Object.assign(function PopoverDropdown(
  props: PopoverDropdownProps,
) {
  return (
    <MantinePopoverDropdown {...props} data-element-id="mantine-popover" />
  );
},
MantinePopoverDropdown);

Popover.Dropdown = PopoverDropdown as typeof MantinePopoverDropdown;

export { Popover };
