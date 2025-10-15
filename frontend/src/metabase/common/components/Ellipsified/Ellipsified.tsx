import type { FloatingPosition } from "@mantine/core/lib";
import type { ReactNode } from "react";

import { useIsTruncated } from "metabase/common/hooks/use-is-truncated";
import { Text, type TextProps, Tooltip } from "metabase/ui";

interface EllipsifiedProps extends TextProps {
  showTooltip?: boolean;
  alwaysShowTooltip?: boolean;
  tooltip?: ReactNode;
  children?: ReactNode;
  tooltipMaxWidth?: number | "auto";
  lines?: number;
  multiline?: boolean;
  placement?: FloatingPosition;
}

export const Ellipsified = ({
  showTooltip = true,
  alwaysShowTooltip,
  tooltip,
  children,
  tooltipMaxWidth,
  lines = 1,
  multiline = false,
  placement = "top",
  ...textProps
}: EllipsifiedProps) => {
  const canSkipTooltipRendering = !showTooltip && !alwaysShowTooltip;
  const { isTruncated, ref } = useIsTruncated<HTMLDivElement>({
    disabled: canSkipTooltipRendering,
  });
  const isEnabled =
    (showTooltip && (isTruncated || alwaysShowTooltip)) || false;

  const truncatedProps: Partial<TextProps> =
    lines > 1 ? { lineClamp: lines } : { truncate: true };

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
        c="inherit"
        ref={ref}
        fz="inherit"
        lh="inherit"
        {...truncatedProps}
        {...textProps}
      >
        {children}
      </Text>
    </Tooltip>
  );
};
