// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";
import { Box, type BoxProps, type FloatingPosition } from "@mantine/core";
import cx from "classnames";
import type { MouseEvent, ReactNode, SVGAttributes } from "react";
import { forwardRef } from "react";

import { ALL_COLOR_NAMES } from "metabase/ui/colors/constants/color-names";
import type { ColorName } from "metabase/ui/colors/types";

import { Tooltip } from "../../overlays/Tooltip";

import type { IconName } from "./icons";
import { Icons } from "./icons";

const PALETTE_KEYS = new Set<string>(ALL_COLOR_NAMES);

/**
 * Mantine's `Box` forwards the `color` prop to the SVG as a presentation
 * attribute, so it only honors valid CSS color strings — bare palette keys
 * like `"saturated-yellow"` are silently ignored. Resolve known palette keys
 * to their `--mb-color-*` CSS variables; pass other strings through.
 */
const resolveIconColor = (color: string | undefined) =>
  color != null && PALETTE_KEYS.has(color) ? `var(--mb-color-${color})` : color;

const defaultSize = 16;

export type IconProps = Omit<SVGAttributes<SVGSVGElement>, "color"> &
  BoxProps & {
    name: IconName;
    size?: string | number;
    tooltip?: ReactNode;
    tooltipPosition?: FloatingPosition;
    onClick?: (event: MouseEvent<HTMLImageElement | SVGElement>) => void;
    className?: string;
    color?: ColorName | "inherit";
  };

export const Icon = forwardRef<SVGSVGElement, IconProps>(function Icon(
  {
    name,
    className,
    size = defaultSize,
    tooltip,
    tooltipPosition,
    ...restProps
  }: IconProps,
  ref,
) {
  const IconComponent = (Icons[name] ?? Icons["unknown"]).component;

  // Box forwards `color` as a raw SVG presentation attribute, so palette keys
  // like "saturated-yellow" don't render — only valid CSS color strings do.
  // Resolve known palette keys to their `--mb-color-*` CSS variables.
  if ("color" in restProps) {
    restProps.color = resolveIconColor(restProps.color) as ColorName;
  }

  const icon = (
    <Box
      component={IconComponent}
      role="img"
      ref={ref}
      aria-label={`${name} icon`}
      className={cx(`Icon Icon-${name}`, className)}
      width={size}
      height={size}
      {...restProps}
    />
  );

  return tooltip ? (
    <Tooltip
      label={tooltip}
      data-testid="icon-tooltip"
      position={tooltipPosition}
    >
      {icon}
    </Tooltip>
  ) : (
    icon
  );
});

/** An icon that does not shrink when its container is too narrow **/
export const FixedSizeIcon = styled(Icon)`
  flex-shrink: 0;
`;
