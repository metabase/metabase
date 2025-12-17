import type { ReactNode } from "react";

import { useIsTruncated } from "metabase/common/hooks/use-is-truncated";
import { Text, type TextProps, Tooltip, type TooltipProps } from "metabase/ui";

interface EllipsifiedProps extends TextProps {
  showTooltip?: boolean;
  alwaysShowTooltip?: boolean;
  tooltip?: ReactNode;
  children?: ReactNode;
  lines?: number;
  ignoreHeightTruncation?: boolean;
  tooltipProps?: Partial<TooltipProps>;
}

export const Ellipsified = ({
  showTooltip = true,
  alwaysShowTooltip,
  tooltip,
  children,
  lines = 1,
  ignoreHeightTruncation = false,
  tooltipProps,
  ...textProps
}: EllipsifiedProps) => {
  const canSkipTooltipRendering = !showTooltip && !alwaysShowTooltip;
  const { isTruncated, ref } = useIsTruncated<HTMLDivElement>({
    disabled: canSkipTooltipRendering,
    ignoreHeightTruncation,
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
      position="top"
      {...tooltipProps}
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
