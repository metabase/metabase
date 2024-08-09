import type { FloatingPosition } from "@mantine/core/lib/Floating";
import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from "react";

import { useIsTruncated } from "metabase/hooks/use-is-truncated";
import { type BoxProps, Tooltip } from "metabase/ui";

import { EllipsifiedRoot } from "./Ellipsified.styled";

type EllipsifiedProps = {
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
} & BoxProps & {
    ref?: Ref<HTMLDivElement | null>;
  } & HTMLAttributes<HTMLDivElement>;

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
  ...boxProps
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
        {...boxProps}
      >
        {children}
      </EllipsifiedRoot>
    </Tooltip>
  );
};
