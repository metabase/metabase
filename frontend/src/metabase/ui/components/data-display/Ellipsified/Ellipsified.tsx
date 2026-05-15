import type { ReactNode } from "react";

import { Text, type TextProps, Tooltip, type TooltipProps } from "metabase/ui";
import { useIsTruncated } from "metabase/ui/hooks/use-is-truncated";

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
  const isSingleLine = lines === 1;
  const canSkipTooltipRendering = !showTooltip && !alwaysShowTooltip;
  // Single-line truncate clips only horizontally, so vertical overflow isn't truncation.
  const { isTruncated, ref } = useIsTruncated<HTMLDivElement>({
    disabled: canSkipTooltipRendering,
    ignoreHeightTruncation: ignoreHeightTruncation || isSingleLine,
  });
  const isEnabled =
    (showTooltip && (isTruncated || alwaysShowTooltip)) || false;

  const truncatedProps: Partial<TextProps> = isSingleLine
    ? { truncate: true }
    : { lineClamp: lines };

  // Override Mantine's `overflow: hidden` so deep descenders (e.g. `₂` in `tCO₂e`) render past the line box without growing it (metabase#72443).
  // `min-width: 0` keeps flex-layout shrink-to-fit working; `overflow: hidden` gets it implicitly but `overflow: clip` doesn't.
  const overflowStyle = isSingleLine
    ? {
        overflowX: "clip" as const,
        overflowY: "visible" as const,
        minWidth: 0,
      }
    : undefined;

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
        style={{ ...overflowStyle, ...textProps.style }}
      >
        {children}
      </Text>
    </Tooltip>
  );
};
