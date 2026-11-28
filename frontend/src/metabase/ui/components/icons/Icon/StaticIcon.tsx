import { Box, type BoxProps, type FloatingPosition } from "@mantine/core";
import cx from "classnames";
import type {
  FunctionComponent,
  MouseEvent,
  ReactNode,
  SVGAttributes,
  SVGProps,
} from "react";
import { forwardRef } from "react";

import { ALL_COLOR_NAMES } from "metabase/ui/colors/constants/color-names";
import type { ColorName } from "metabase/ui/colors/types";
import type { IconName } from "metabase-types/api/icon";

import { Tooltip } from "../../overlays/Tooltip";

const PALETTE_KEYS = new Set<string>(ALL_COLOR_NAMES);

/**
 * Mantine's `Box` forwards the `color` prop to the SVG as a presentation
 * attribute, so it only honors valid CSS color strings — bare palette keys
 * like `"core-yellow-saturated"` are silently ignored. Resolve known palette keys
 * to their `--mb-color-*` CSS variables; pass other strings through.
 */
const resolveIconColor = (color: string | undefined) =>
  color != null && PALETTE_KEYS.has(color) ? `var(--mb-color-${color})` : color;

const defaultSize = 16;

export type IconComponent = FunctionComponent<SVGProps<SVGSVGElement>>;

export type StaticIconProps = Omit<SVGAttributes<SVGSVGElement>, "color"> &
  BoxProps & {
    name?: IconName;
    component: IconComponent;
    size?: string | number;
    tooltip?: ReactNode;
    tooltipPosition?: FloatingPosition;
    onClick?: (event: MouseEvent<HTMLImageElement | SVGElement>) => void;
    className?: string;
    color?: ColorName | "inherit";
  };

export const StaticIcon = forwardRef<SVGSVGElement, StaticIconProps>(
  function StaticIcon(
    {
      name,
      component,
      className,
      color,
      size = defaultSize,
      tooltip,
      tooltipPosition,
      ...restProps
    }: StaticIconProps,
    ref,
  ) {
    const icon = (
      <Box
        component={component}
        role="img"
        ref={ref}
        aria-label={name && `${name} icon`}
        className={cx("Icon", name && `Icon-${name}`, className)}
        width={size}
        height={size}
        color={resolveIconColor(color)}
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
  },
);
