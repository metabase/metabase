import {
  Tooltip as MantineTooltip,
  type TooltipProps,
  useProps,
} from "@mantine/core";
import {
  type PropsWithChildren,
  createContext,
  forwardRef,
  useContext,
  useMemo,
} from "react";

import { useIsTransitionOpen } from "./use-is-transition-open";
import { useTooltipEventIsolation } from "./use-tooltip-event-isolation";

const TooltipPortalTargetContext = createContext<HTMLElement | null>(null);

export function TooltipPortalTargetProvider({
  target,
  children,
}: PropsWithChildren<{ target: HTMLElement | null }>) {
  return (
    <TooltipPortalTargetContext.Provider value={target}>
      {children}
    </TooltipPortalTargetContext.Provider>
  );
}

const TooltipImpl = forwardRef<HTMLDivElement, TooltipProps>(
  function TooltipImpl(props, ref) {
    const { label, portalProps, transitionProps, mod, ...rest } = useProps(
      "Tooltip",
      {},
      props,
    );
    const contextTarget = useContext(TooltipPortalTargetContext);
    const callerPortalTarget = props.portalProps?.target;
    const resolvedPortalProps = useMemo(
      () =>
        contextTarget && callerPortalTarget == null
          ? { ...portalProps, target: contextTarget }
          : portalProps,
      [contextTarget, callerPortalTarget, portalProps],
    );

    const isControlled = rest.opened !== undefined;
    const { isOpen, transitionProps: resolvedTransitionProps } =
      useIsTransitionOpen(transitionProps);

    const isHoverable = isOpen && !isControlled;

    const { tooltipProps, labelProps } = useTooltipEventIsolation(rest);

    return (
      <MantineTooltip
        {...rest}
        {...tooltipProps}
        // The delay only gives the pointer time to reach the tooltip. Mantine
        // still opens a disabled one invisibly, and while open it takes the
        // Escape key, so it shouldn't linger.
        closeDelay={rest.disabled ? 0 : rest.closeDelay}
        label={<div {...labelProps}>{label}</div>}
        mod={[{ hoverable: isHoverable }, mod]}
        portalProps={resolvedPortalProps}
        transitionProps={resolvedTransitionProps}
        ref={ref}
      />
    );
  },
);

export const Tooltip = Object.assign(TooltipImpl, {
  Floating: MantineTooltip.Floating,
  Group: MantineTooltip.Group,
});
