import { cloneElement, forwardRef } from "react";
import type { PopoverTargetProps } from "@mantine/core";
import { useMergedRef } from "@mantine/hooks";
import { isElement } from "@mantine/utils";
import { usePopoverContext } from "../PopoverContext";
import { POPOVER_ERRORS } from "../constants";

export const PopoverTarget = forwardRef<HTMLElement, PopoverTargetProps>(
  function PopoverTarget(
    {
      refProp = "ref",
      popupType = "dialog",
      shouldOverrideDefaultTargetId = true,
      children,
      ...others
    },
    ref,
  ) {
    if (!isElement(children)) {
      throw new Error(POPOVER_ERRORS.children);
    }

    const ctx = usePopoverContext();
    const targetRef = useMergedRef(ctx.reference, (children as any).ref, ref);

    return cloneElement(children, {
      [refProp]: targetRef,
      ...(!ctx.controlled ? { onClick: ctx.onToggle } : {}),
      ...others,
    });
  },
);
