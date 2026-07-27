import { Tooltip as MantineTooltip, type TooltipProps } from "@mantine/core";
import {
  type PropsWithChildren,
  createContext,
  forwardRef,
  useContext,
  useMemo,
} from "react";

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
  function TooltipImpl({ portalProps, ...props }, ref) {
    const contextTarget = useContext(TooltipPortalTargetContext);
    const resolvedPortalProps = useMemo(
      () =>
        contextTarget && portalProps?.target == null
          ? { ...portalProps, target: contextTarget }
          : portalProps,
      [contextTarget, portalProps],
    );

    return (
      <MantineTooltip {...props} portalProps={resolvedPortalProps} ref={ref} />
    );
  },
);

export const Tooltip = Object.assign(TooltipImpl, {
  Floating: MantineTooltip.Floating,
  Group: MantineTooltip.Group,
});
