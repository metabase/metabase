import { getDefaultZIndex, useMantineTheme } from "@mantine/core";
import type { PopoverProps } from "@mantine/core";
import { useCallback, useRef, useState } from "react";
import { useClickOutside, useId } from "@mantine/hooks";
import { getFloatingPosition } from "../Floating";
import { usePopover } from "./use-popover";
import { PopoverContextProvider } from "./PopoverContext";

const defaultProps = {
  position: "bottom" as const,
  offset: 8,
  positionDependencies: [],
  transitionProps: { transition: "fade", duration: 150 } as const,
  middlewares: { flip: true, shift: true, inline: false } as const,
  arrowSize: 7,
  arrowOffset: 5,
  arrowRadius: 0,
  arrowPosition: "side" as const,
  closeOnClickOutside: true,
  withinPortal: false,
  closeOnEscape: true,
  trapFocus: false,
  withRoles: true,
  returnFocus: false,
  clickOutsideEvents: ["mousedown", "touchstart"],
  zIndex: getDefaultZIndex("popover"),
  __staticSelector: "Popover",
  width: "max-content",
  unstyled: false,
  withArrow: false,
};

export function Popover({
  children,
  position = defaultProps.position,
  offset = defaultProps.offset,
  onPositionChange,
  positionDependencies = defaultProps.positionDependencies,
  opened,
  transitionProps = defaultProps.transitionProps,
  width = defaultProps.width,
  middlewares = defaultProps.middlewares,
  withArrow = defaultProps.withArrow,
  arrowSize = defaultProps.arrowSize,
  arrowOffset = defaultProps.arrowOffset,
  arrowRadius = defaultProps.arrowRadius,
  arrowPosition = defaultProps.arrowPosition,
  unstyled = defaultProps.unstyled,
  classNames,
  styles,
  closeOnClickOutside = defaultProps.closeOnClickOutside,
  withinPortal = defaultProps.withinPortal,
  portalProps,
  closeOnEscape = defaultProps.closeOnEscape,
  clickOutsideEvents = defaultProps.clickOutsideEvents,
  trapFocus = defaultProps.trapFocus,
  onClose,
  onOpen,
  onChange,
  zIndex = defaultProps.zIndex,
  radius,
  shadow,
  id,
  defaultOpened,
  __staticSelector = defaultProps.__staticSelector,
  withRoles = defaultProps.withRoles,
  disabled,
  returnFocus = defaultProps.returnFocus,
  variant,
  keepMounted,
  ...others
}: PopoverProps) {
  const arrowRef = useRef<HTMLDivElement | null>(null);
  const [targetNode, setTargetNode] = useState<HTMLElement | null>(null);
  const [dropdownNode, setDropdownNode] = useState<HTMLElement | null>(null);

  const uid = useId(id);
  const theme = useMantineTheme();
  const popover = usePopover({
    middlewares,
    width,
    position: getFloatingPosition(theme.dir, position),
    offset:
      typeof offset === "number"
        ? offset + (withArrow ? arrowSize / 2 : 0)
        : offset,
    arrowRef,
    arrowOffset,
    onPositionChange,
    positionDependencies,
    opened,
    defaultOpened,
    onChange,
    onOpen,
    onClose,
  });

  useClickOutside(
    () => popover.opened && closeOnClickOutside && popover.onClose(),
    clickOutsideEvents,
    [targetNode, dropdownNode],
  );

  const reference = useCallback(
    (node: HTMLElement | null) => {
      setTargetNode(node);
      popover.floating.reference(node);
    },
    [popover.floating.reference],
  );

  const floating = useCallback(
    (node: HTMLElement | null) => {
      setDropdownNode(node);
      popover.floating.floating(node);
    },
    [popover.floating.floating],
  );

  return (
    <PopoverContextProvider
      value={{
        returnFocus,
        disabled,
        controlled: popover.controlled,
        reference,
        floating,
        x: popover.floating.x,
        y: popover.floating.y,
        arrowX: popover.floating?.middlewareData?.arrow?.x,
        arrowY: popover.floating?.middlewareData?.arrow?.y,
        opened: popover.opened,
        arrowRef,
        transitionProps,
        width,
        withArrow,
        arrowSize,
        arrowOffset,
        arrowRadius,
        arrowPosition,
        placement: popover.floating.placement,
        trapFocus,
        withinPortal,
        portalProps,
        zIndex,
        radius,
        shadow,
        closeOnEscape,
        onClose: popover.onClose,
        onToggle: popover.onToggle,
        getTargetId: () => `${uid}-target`,
        getDropdownId: () => `${uid}-dropdown`,
        withRoles,
        targetProps: others,
        __staticSelector,
        classNames,
        styles,
        unstyled,
      }}
    >
      {children}
    </PopoverContextProvider>
  );
}
