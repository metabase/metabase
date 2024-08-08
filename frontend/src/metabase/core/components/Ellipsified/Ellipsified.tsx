import type { FloatingPosition } from "@mantine/core/lib/Floating";
import type { CSSProperties, ReactNode } from "react";

import { useIsTruncated } from "metabase/hooks/use-is-truncated";
import { Tooltip } from "metabase/ui";

import { EllipsifiedRoot } from "./Ellipsified.styled";

interface EllipsifiedProps {
  style?: CSSProperties;
  className?: string;
  showTooltip?: boolean;
  alwaysShowTooltip?: boolean;
  tooltip?: ReactNode;
  children?: ReactNode;
  tooltipMaxWidth?: number | "auto";
  lines?: number;
  placement?: FloatingPosition;
  "data-testid"?: string;
  id?: string;
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
  id,
}: EllipsifiedProps) => {
  const canSkipTooltipRendering = !showTooltip && !alwaysShowTooltip;
  const { isTruncated, ref } = useIsTruncated<HTMLDivElement>({
    disabled: canSkipTooltipRendering,
  });
  const isEnabled =
    (showTooltip && (isTruncated || alwaysShowTooltip)) || false;

  return (
    <Tooltip
      data-testid="ellipsified-tooltip"
      disabled={!isEnabled}
      label={canSkipTooltipRendering ? undefined : tooltip || children || " "}
      position={placement}
      width={tooltipMaxWidth}
    >
      <EllipsifiedRoot
        ref={ref}
        className={className}
        lines={lines}
        style={style}
        data-testid={dataTestId}
        id={id}
      >
        {children}
      </EllipsifiedRoot>
    </Tooltip>
  );
};
