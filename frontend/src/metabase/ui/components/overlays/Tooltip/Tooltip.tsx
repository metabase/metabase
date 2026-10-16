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
    const resolvedPortalProps = useMemo(
      () =>
        contextTarget && portalProps?.target == null
          ? { ...portalProps, target: contextTarget }
          : portalProps,
      [contextTarget, portalProps],
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
