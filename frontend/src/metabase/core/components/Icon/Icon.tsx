import React, { forwardRef } from "react";
import Tooltip from "../Tooltip";
import { Icons } from "./svg";

const defaultSize = 16;

export type IconProps = {
  name: keyof typeof Icons;
  color?: string;
  size?: string | number;
  tooltip?: string | null;
  onClick?: (event: React.MouseEvent<HTMLImageElement | SVGElement>) => void;
  style?: React.CSSProperties;
  className?: string;
};

export const Icon = forwardRef(function Icon(
  {
    name,
    style,
    className,
    size = defaultSize,
    tooltip,
    color,
    onClick,
  }: IconProps,
  ref,
) {
  const IconComponent = Icons[name] ?? Icons["unknown"];

  const icon = (
    <IconComponent
      ref={ref}
      aria-label={`${name} icon`}
      className={className}
      style={style}
      width={size}
      height={size}
      color={color}
      onClick={onClick}
    />
  );

  return tooltip ? <Tooltip tooltip={tooltip}>{icon}</Tooltip> : icon;
});
