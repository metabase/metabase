import type { PopoverDropdownProps } from "@mantine/core";
import { Popover } from "@mantine/core";

export function PopoverDropdown({ children, ...props }: PopoverDropdownProps) {
  return <Popover.Dropdown {...props}>{children}</Popover.Dropdown>;
}
