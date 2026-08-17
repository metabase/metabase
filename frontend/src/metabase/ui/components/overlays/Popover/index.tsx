import { Popover as MantinePopover, type PopoverProps } from "@mantine/core";

import { PopoverDropdown } from "./PopoverDropdown";

export type { PopoverProps } from "@mantine/core";
export { popoverOverrides } from "./Popover.config";

function PopoverRoot(props: PopoverProps) {
  return <MantinePopover {...props} />;
}

export const Popover = Object.assign(PopoverRoot, MantinePopover, {
  Dropdown: PopoverDropdown,
});
export { DEFAULT_POPOVER_Z_INDEX } from "./Popover.config";
