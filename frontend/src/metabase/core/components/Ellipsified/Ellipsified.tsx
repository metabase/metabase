import type { FloatingPosition } from "@mantine/core/lib";
import type { CSSProperties, ReactNode } from "react";

import { useIsTruncated } from "metabase/hooks/use-is-truncated";
import { Text, Tooltip } from "metabase/ui";

export interface EllipsifiedProps {
  style?: CSSProperties;
  className?: string;
  showTooltip?: boolean;
  alwaysShowTooltip?: boolean;
  tooltip?: ReactNode;
  children?: ReactNode;
  tooltipMaxWidth?: number | "auto";
  lines?: number;
  multiline?: boolean;
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
  lines = 1,
  multiline = false,
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
      w={tooltipMaxWidth}
      multiline={multiline}
    >
      <Text
        lineClamp={lines}
        c="inherit"
        ref={ref}
        className={className}
        style={style}
        data-testid={dataTestId}
        id={id}
        fz="inherit"
        lh="inherit"
      >
        {children}
      </Text>
    </Tooltip>
  );
};
