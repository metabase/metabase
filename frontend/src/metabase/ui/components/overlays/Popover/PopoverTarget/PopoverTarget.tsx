import { forwardRef, useContext } from "react";
import type { Ref } from "react";
import type { PopoverTargetProps } from "@mantine/core";
import { Popover } from "@mantine/core";
import { useMergedRef } from "@mantine/hooks";
import { PopoverContext } from "../PopoverContext";

export const PopoverTarget = forwardRef(function PopoverTarget(
  { children, ...props }: PopoverTargetProps,
  forwardedRef: Ref<HTMLDivElement>,
) {
  const { targetRef } = useContext(PopoverContext);
  const mergedRef = useMergedRef([targetRef, forwardedRef]);

  return (
    <Popover.Target {...props} ref={mergedRef}>
      {children}
    </Popover.Target>
  );
});
