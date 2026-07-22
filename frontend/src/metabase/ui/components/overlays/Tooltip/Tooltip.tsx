import { Tooltip as MantineTooltip, type TooltipProps } from "@mantine/core";
import { type PropsWithChildren, createContext, useContext } from "react";

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

export const Tooltip = Object.assign(
  function Tooltip({ portalProps, ...props }: TooltipProps) {
    const contextTarget = useContext(TooltipPortalTargetContext);
    const resolvedPortalProps =
      contextTarget && portalProps?.target == null
        ? { ...portalProps, target: contextTarget }
        : portalProps;
    return <MantineTooltip {...props} portalProps={resolvedPortalProps} />;
  },
  {
    Floating: MantineTooltip.Floating,
    Group: MantineTooltip.Group,
  },
);
