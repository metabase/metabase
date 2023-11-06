import { useRef } from "react";
import type { PopoverProps } from "@mantine/core";
import { Popover as MantinePopover } from "@mantine/core";
import { PopoverContext } from "./PopoverContext";
import { PopoverDropdown } from "./PopoverDropdown";
import { PopoverTarget } from "./PopoverTarget";

export function Popover(props: PopoverProps) {
  const targetRef = useRef<HTMLDivElement>(null);

  return (
    <PopoverContext.Provider value={{ targetRef }}>
      <MantinePopover {...props} />
    </PopoverContext.Provider>
  );
}

Popover.Target = PopoverTarget;
Popover.Dropdown = PopoverDropdown;
