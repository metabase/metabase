import cx from "classnames";
import { forwardRef } from "react";

import type { IconName } from "metabase-types/api/icon";

import S from "./Icon.module.css";
import { StaticIcon, type StaticIconProps } from "./StaticIcon";
import { Icons } from "./icons";

export type IconProps = Omit<StaticIconProps, "name" | "component"> & {
  name: IconName;
};

export const Icon = forwardRef<SVGSVGElement, IconProps>(function Icon(
  { name, ...props },
  ref,
) {
  return (
    <StaticIcon
      ref={ref}
      name={name}
      component={Icons[name] ?? Icons.unknown}
      {...props}
    />
  );
});

/** An icon that does not shrink when its container is too narrow **/
export const FixedSizeIcon = forwardRef<SVGSVGElement, IconProps>(
  function FixedSizeIcon({ className, ...restProps }: IconProps, ref) {
    return (
      <Icon ref={ref} className={cx(S.fixedSize, className)} {...restProps} />
    );
  },
);
