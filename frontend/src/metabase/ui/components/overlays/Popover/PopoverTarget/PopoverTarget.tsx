import { cloneElement, forwardRef } from "react";
import type { PopoverTargetProps } from "@mantine/core";
import { useMergedRef } from "@mantine/hooks";
import { clsx, useComponentDefaultProps } from "@mantine/styles";
import { isElement } from "@mantine/utils";
import { usePopoverContext } from "../PopoverContext";
import { POPOVER_ERRORS } from "../constants";

const defaultProps: Partial<PopoverTargetProps> = {
  refProp: "ref",
  popupType: "dialog",
  shouldOverrideDefaultTargetId: true,
};

export const PopoverTarget = forwardRef<HTMLElement, PopoverTargetProps>(
  function PopoverTarget(props, ref) {
    const {
      children,
      refProp = "",
      popupType,
      shouldOverrideDefaultTargetId,
      ...others
    } = useComponentDefaultProps("PopoverTarget", defaultProps, props);

    if (!isElement(children)) {
      throw new Error(POPOVER_ERRORS.children);
    }

    const forwardedProps = others as any;
    const ctx = usePopoverContext();
    const targetRef = useMergedRef(ctx.reference, (children as any).ref, ref);

    const accessibleProps = ctx.withRoles
      ? {
          "aria-haspopup": popupType,
          "aria-expanded": ctx.opened,
          "aria-controls": ctx.getDropdownId(),
          id: shouldOverrideDefaultTargetId
            ? ctx.getTargetId()
            : children.props.id,
        }
      : {};

    return cloneElement(children, {
      ...forwardedProps,
      ...accessibleProps,
      ...ctx.targetProps,
      className: clsx(
        ctx.targetProps.className,
        forwardedProps.className,
        children.props.className,
      ),
      [refProp]: targetRef,
      ...(!ctx.controlled ? { onClick: ctx.onToggle } : null),
    });
  },
);
