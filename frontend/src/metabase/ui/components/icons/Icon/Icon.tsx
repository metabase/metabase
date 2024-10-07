import { Box, type BoxProps } from "@mantine/core";
import cx from "classnames";
import type { MouseEvent, ReactNode, SVGAttributes } from "react";
import { forwardRef } from "react";

import { Tooltip } from "../../overlays/Tooltip";

import S from "./Icon.module.css";
import type { IconName } from "./icons";
import { Icons } from "./icons";

const defaultSize = 16;

export type IconProps = SVGAttributes<SVGSVGElement> &
  BoxProps & {
    name: IconName;
    size?: string | number;
    tooltip?: ReactNode;
    onClick?: (event: MouseEvent<HTMLImageElement | SVGElement>) => void;
    className?: string;
  };

export const Icon = forwardRef<SVGSVGElement, IconProps>(function Icon(
  { name, className, size = defaultSize, tooltip, ...restProps }: IconProps,
  ref,
) {
  const IconComponent = (Icons[name] ?? Icons["unknown"]).component;

  const icon = (
    <Box
      component={IconComponent}
      role="img"
      ref={ref}
      aria-label={`${name} icon`}
      className={cx(`Icon Icon-${name}`, S.Icon, className)}
      width={size}
      height={size}
      {...restProps}
    />
  );

  return tooltip ? <Tooltip label={tooltip}>{icon}</Tooltip> : icon;
});
