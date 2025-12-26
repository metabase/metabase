// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";
import { Box, type BoxProps, type FloatingPosition } from "@mantine/core";
import cx from "classnames";
import type { MouseEvent, ReactNode, SVGAttributes } from "react";
import { forwardRef } from "react";

import { isProduction } from "metabase/env";

import { Tooltip } from "../../overlays/Tooltip";

import type { IconName } from "./icons";
import { Icons } from "./icons";

const defaultSize = 16;

export type IconProps = SVGAttributes<SVGSVGElement> &
  BoxProps & {
    name: IconName;
    size?: string | number;
    tooltip?: ReactNode;
    tooltipPosition?: FloatingPosition;
    onClick?: (event: MouseEvent<HTMLImageElement | SVGElement>) => void;
    className?: string;
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
  const iconEntry = Icons[name];
  if (!iconEntry && !isProduction) {
    throw new Error(`Unknown icon: "${name}"`);
  }
  const IconComponent = (iconEntry ?? Icons["unknown"]).component;

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
