import type { CSSProperties, ReactNode } from "react";
import type { Placement } from "tippy.js";

import Tooltip from "metabase/core/components/Tooltip";
import { useIsTruncated } from "metabase/hooks/use-is-truncated";

import { EllipsifiedRoot } from "./Ellipsified.styled";

interface EllipsifiedProps {
  style?: CSSProperties;
  className?: string;
  showTooltip?: boolean;
  alwaysShowTooltip?: boolean;
  tooltip?: ReactNode;
  children?: ReactNode;
  tooltipMaxWidth?: CSSProperties["maxWidth"];
  lines?: number;
  placement?: Placement;
  "data-testid"?: string;
}

export const Ellipsified = ({
  style,
  className,
  showTooltip = true,
  alwaysShowTooltip,
  tooltip,
  children,
  tooltipMaxWidth,
  lines,
  placement = "top",
  "data-testid": dataTestId,
}: EllipsifiedProps) => {
  const canSkipTooltipRendering = !showTooltip && !alwaysShowTooltip;
  const { isTruncated, ref } = useIsTruncated<HTMLDivElement>({
    skip: canSkipTooltipRendering,
  });

  return (
    <Tooltip
      tooltip={canSkipTooltipRendering ? undefined : tooltip || children || " "}
      isEnabled={(showTooltip && (isTruncated || alwaysShowTooltip)) || false}
      maxWidth={tooltipMaxWidth}
      placement={placement}
    >
      <EllipsifiedRoot
        ref={ref}
        className={className}
        lines={lines}
        style={style}
        data-testid={dataTestId}
      >
        {children}
      </EllipsifiedRoot>
    </Tooltip>
  );
};
