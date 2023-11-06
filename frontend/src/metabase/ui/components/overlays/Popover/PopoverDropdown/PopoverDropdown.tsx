import { useContext, useLayoutEffect, useState } from "react";
import { Popover } from "@mantine/core";
import type { PopoverDropdownProps } from "@mantine/core";
import { PopoverContext } from "../PopoverContext";

export function PopoverDropdown({ children, ...props }: PopoverDropdownProps) {
  const { targetRef } = useContext(PopoverContext);
  const [maxHeight, setMaxHeight] = useState<number | undefined>();

  useLayoutEffect(() => {
    if (targetRef?.current) {
      setMaxHeight(getMaxHeight(targetRef.current));
    }
  }, [targetRef]);

  return (
    <Popover.Dropdown {...props} style={{ ...props.style, maxHeight }}>
      {children}
    </Popover.Dropdown>
  );
}

function getMaxHeight(target: HTMLElement) {
  const targetRect = target.getBoundingClientRect();
  const documentRect = document.documentElement.getBoundingClientRect();
  return Math.max(
    targetRect.top - documentRect.top,
    documentRect.bottom - targetRect.bottom,
  );
}
