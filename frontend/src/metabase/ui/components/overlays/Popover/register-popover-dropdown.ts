import { Popover as MantinePopover } from "@mantine/core";

import { PopoverDropdown } from "./PopoverDropdown";

// Mantine's Combobox, Menu, ColorInput and HoverCard render `Popover.Dropdown` internally,
// so the wrapped dropdown has to be installed on Mantine's own Popover object for every Select and Menu to get it.
MantinePopover.Dropdown = PopoverDropdown;
