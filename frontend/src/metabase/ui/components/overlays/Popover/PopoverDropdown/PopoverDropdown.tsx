import { useContext, useLayoutEffect, useState } from "react";
import { Popover } from "@mantine/core";
import type { PopoverProps, PopoverDropdownProps } from "@mantine/core";
import { PopoverContext } from "../PopoverContext";

export function PopoverDropdown({ children, ...props }: PopoverDropdownProps) {
  const { targetRef, offset } = useContext(PopoverContext);
  const [maxHeight, setMaxHeight] = useState<number | undefined>();

  useLayoutEffect(() => {
    if (targetRef?.current) {
      setMaxHeight(getMaxHeight(targetRef.current, offset));
    }
  }, [targetRef, offset]);

  return (
    <Popover.Dropdown {...props} style={{ ...props.style, maxHeight }}>
      {children}
    </Popover.Dropdown>
  );
}

function getMaxHeight(target: HTMLElement, offset: PopoverProps["offset"]) {
  const offsetValue =
    typeof offset === "number" ? offset : offset?.mainAxis ?? 0;

  const targetRect = target.getBoundingClientRect();
  const documentRect = document.documentElement.getBoundingClientRect();
  return Math.max(
    targetRect.top - documentRect.top - offsetValue,
    documentRect.bottom - targetRect.bottom - offsetValue,
  );
}
