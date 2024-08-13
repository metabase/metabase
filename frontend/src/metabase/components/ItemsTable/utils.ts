import { breakpoints, type BreakpointName } from "metabase/ui/theme";

export interface ResponsiveProps {
  /** The element will be hidden when the container's width is below this breakpoint */
  hideAtContainerBreakpoint?: BreakpointName;
  containerName?: string;
}

export const getContainerQuery = (props: ResponsiveProps) =>
  props.hideAtContainerBreakpoint
    ? `@container ${props.containerName || ""} (max-width: ${
        breakpoints[props.hideAtContainerBreakpoint]
      }) { display: none; }`
    : "";
