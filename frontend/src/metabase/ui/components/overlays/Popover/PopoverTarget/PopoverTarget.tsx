import type { PopoverTargetProps } from "@mantine/core";
import { Popover } from "@mantine/core";

export function PopoverTarget({ children, ...props }: PopoverTargetProps) {
  return <Popover.Target {...props}>{children}</Popover.Target>;
}
