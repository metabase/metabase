// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";
import { Box, type BoxProps, type FloatingPosition } from "@mantine/core";
import cx from "classnames";
import type { MouseEvent, ReactNode, SVGAttributes } from "react";
import { forwardRef } from "react";

import type { ColorName } from "metabase/ui/colors/types";
import { resolveIconColor } from "metabase/ui/utils/colors";
import type { IconName } from "metabase-types/api";

import { Tooltip } from "../../overlays/Tooltip";

import { Icons } from "./icons";

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
