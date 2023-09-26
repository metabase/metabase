import type { SVGAttributes, MouseEvent } from "react";

import { forwardRef } from "react";
import isPropValid from "@emotion/is-prop-valid";
import cx from "classnames";
import Tooltip from "../Tooltip";
import { Icons } from "./icons";
import type { IconName } from "./icons";

const defaultSize = 16;

export interface IconProps extends SVGAttributes<SVGSVGElement> {
  name: IconName;
  size?: string | number;
  tooltip?: string | null;
  onClick?: (event: MouseEvent<HTMLImageElement | SVGElement>) => void;
  className?: string;
}

export const Icon = forwardRef<SVGSVGElement, IconProps>(function Icon(
  { name, className, size = defaultSize, tooltip, ...restProps }: IconProps,
  ref,
) {
  const IconComponent = (Icons[name] ?? Icons["unknown"]).component;
  const validProps = Object.fromEntries(
    Object.entries(restProps).filter(([key]) => isPropValid(key)),
  );

  const icon = (
    <IconComponent
      role="img"
      ref={ref}
      aria-label={`${name} icon`}
      className={cx(`Icon Icon-${name}`, className)}
      width={size}
      height={size}
      {...validProps}
    />
  );

  return tooltip ? <Tooltip tooltip={tooltip}>{icon}</Tooltip> : icon;
});
