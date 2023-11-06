import type { PopoverDropdownProps } from "@mantine/core";
import { FocusTrap, OptionalPortal, rem, Transition } from "@mantine/core";
import { useFocusReturn } from "@mantine/hooks";
import { closeOnEscape } from "@mantine/utils";
import { usePopoverContext } from "../PopoverContext";
import { Dropdown } from "./PopoverDropdown.styled";

export function PopoverDropdown({
  style,
  className,
  children,
  onKeyDownCapture,
  ...others
}: PopoverDropdownProps) {
  const ctx = usePopoverContext();

  const returnFocus = useFocusReturn({
    opened: ctx.opened,
    shouldReturnFocus: ctx.returnFocus,
  });

  const accessibleProps = ctx.withRoles
    ? {
        "aria-labelledby": ctx.getTargetId(),
        id: ctx.getDropdownId(),
        role: "dialog",
      }
    : {};

  if (ctx.disabled) {
    return null;
  }

  return (
    <OptionalPortal {...ctx.portalProps} withinPortal={ctx.withinPortal}>
      <Transition
        mounted={ctx.opened}
        {...ctx.transitionProps}
        transition={ctx.transitionProps?.transition || "fade"}
        duration={ctx.transitionProps?.duration ?? 150}
        keepMounted={ctx.keepMounted}
        exitDuration={
          typeof ctx.transitionProps?.exitDuration === "number"
            ? ctx.transitionProps?.exitDuration
            : ctx.transitionProps?.duration
        }
      >
        {transitionStyles => (
          <FocusTrap active={ctx.trapFocus}>
            <Dropdown
              {...accessibleProps}
              ref={ctx.floating}
              style={{
                ...style,
                ...transitionStyles,
                zIndex: ctx.zIndex,
                top: ctx.y ?? 0,
                left: ctx.x ?? 0,
                width: ctx.width === "target" ? undefined : rem(ctx.width),
              }}
              className={className}
              onKeyDownCapture={closeOnEscape(ctx.onClose, {
                active: ctx.closeOnEscape,
                onTrigger: returnFocus,
                onKeyDown: onKeyDownCapture,
              })}
              data-position={ctx.placement}
              {...others}
              tabIndex={-1}
            >
              {children}
            </Dropdown>
          </FocusTrap>
        )}
      </Transition>
    </OptionalPortal>
  );
}
