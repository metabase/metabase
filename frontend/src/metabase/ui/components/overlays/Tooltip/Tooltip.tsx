import { Tooltip as MantineTooltip, type TooltipProps } from "@mantine/core";
import {
  type PropsWithChildren,
  createContext,
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

function TooltipImpl({ portalProps, ...props }: TooltipProps) {
  const contextTarget = useContext(TooltipPortalTargetContext);
  const resolvedPortalProps = useMemo(
    () =>
      contextTarget && portalProps?.target == null
        ? { ...portalProps, target: contextTarget }
        : portalProps,
    [contextTarget, portalProps],
  );

  return <MantineTooltip {...props} portalProps={resolvedPortalProps} />;
}

export const Tooltip = Object.assign(TooltipImpl, {
  Floating: MantineTooltip.Floating,
  Group: MantineTooltip.Group,
});
