import type { PropsWithChildren } from "react";

import CS from "metabase/css/core/index.css";
import type { IconName, IconProps } from "metabase/ui";

import { BadgeIcon, BadgeText, MaybeLink } from "./Badge.styled";

const DEFAULT_ICON_SIZE = 16;

function getIconProps(iconProp: IconName | IconProps) {
  const props: IconProps =
    typeof iconProp === "string" ? { name: iconProp } : iconProp;
  if (!props.size) {
    props.size = DEFAULT_ICON_SIZE;
  }
  return props;
}

type BadgeProps = PropsWithChildren<{
  to?: string;
  onClick?: () => void;
  icon?: IconName | IconProps;
  inactiveColor?: string;
  activeColor?: string;
  isSingleLine?: boolean;
}>;

export const Badge = ({
  to,
  icon,
  inactiveColor = "text-medium",
  activeColor = "brand",
  isSingleLine = false,
  onClick,
  children,
  ...props
}: BadgeProps) => (
  <MaybeLink
    inactiveColor={inactiveColor}
    activeColor={activeColor}
    isSingleLine={isSingleLine}
    to={to}
    onClick={onClick}
    {...props}
  >
    {icon && <BadgeIcon {...getIconProps(icon)} hasMargin={!!children} />}
    {children && (
      <BadgeText className={CS.textWrap} isSingleLine={isSingleLine}>
        {children}
      </BadgeText>
    )}
  </MaybeLink>
);
