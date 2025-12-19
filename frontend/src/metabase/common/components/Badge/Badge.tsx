import cx from "classnames";
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
  inactiveColor?: string; // Color values may already be resolved by parent components
  activeColor?: string; // Color values may already be resolved by parent components
  isSingleLine?: boolean;
  className?: string;
  classNames?: {
    root?: string;
    icon?: string;
  };
}>;

export const Badge = ({
  className,
  to,
  icon,
  inactiveColor = "text-secondary",
  activeColor = "brand",
  isSingleLine = false,
  onClick,
  children,
  classNames = {},
  ...props
}: BadgeProps) => (
  <MaybeLink
    inactiveColor={inactiveColor}
    activeColor={activeColor}
    isSingleLine={isSingleLine}
    to={to}
    onClick={onClick}
    className={cx(classNames.root, className)}
    {...props}
  >
    {icon && (
      <BadgeIcon
        {...getIconProps(icon)}
        className={classNames.icon}
        hasMargin={!!children}
      />
    )}
    {children && (
      <BadgeText className={CS.textWrap} isSingleLine={isSingleLine}>
        {children}
      </BadgeText>
    )}
  </MaybeLink>
);
