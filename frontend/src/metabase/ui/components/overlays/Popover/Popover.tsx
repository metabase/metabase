import { useMemo, useRef } from "react";
import type { PopoverProps } from "@mantine/core";
import { Popover as MantinePopover } from "@mantine/core";
import { PopoverDropdown } from "./PopoverDropdown";
import { PopoverTarget } from "./PopoverTarget";
import { PopoverContext } from "./PopoverContext";

export function Popover(props: PopoverProps) {
  const targetRef = useRef<HTMLElement>(null);
  const contextValue = useMemo(() => ({ targetRef }), []);

  return (
    <PopoverContext.Provider value={contextValue}>
      <MantinePopover {...props} />
    </PopoverContext.Provider>
  );
}

Popover.Target = PopoverTarget;
Popover.Dropdown = PopoverDropdown;
