import React, { SVGAttributes, forwardRef } from "react";
import cx from "classnames";
import Tooltip from "../Tooltip";
import { Icons } from "./icons";
import type { IconName } from "./icons";

const defaultSize = 16;

export interface IconProps extends SVGAttributes<SVGSVGElement> {
  name: IconName;
  size?: string | number;
  tooltip?: string | null;
  onClick?: (event: React.MouseEvent<HTMLImageElement | SVGElement>) => void;
  className?: string;
}

export const Icon = forwardRef<SVGSVGElement, IconProps>(function Icon(
  { name, className, size = defaultSize, tooltip, ...rest }: IconProps,
  ref,
) {
  const IconComponent = (Icons[name] ?? Icons["unknown"]).component;

  const icon = (
    <IconComponent
      role="img"
      ref={ref}
      aria-label={`${name} icon`}
      className={cx(`Icon Icon-${name}`, className)}
      width={size}
      height={size}
      {...rest}
    />
  );

  return tooltip ? <Tooltip tooltip={tooltip}>{icon}</Tooltip> : icon;
});
