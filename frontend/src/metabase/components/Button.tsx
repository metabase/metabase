import cx from "classnames";
import React, { ButtonHTMLAttributes, forwardRef, ReactNode, Ref } from "react";
import styled from "styled-components";
import { color, space } from "styled-system";
import _ from "underscore";
import Icon from "metabase/components/Icon";
import { forwardRefToInnerRef } from "metabase/styled-components/utils";

const BUTTON_VARIANTS = [
  "small",
  "medium",
  "large",
  "round",
  "primary",
  "danger",
  "warning",
  "cancel",
  "success",
  "purple",
  "white",
  "borderless",
  "onlyIcon",
] as const;

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string;
  icon?: string;
  iconSize?: number;
  iconColor?: string;
  iconRight?: string;
  iconVertical?: boolean;
  labelBreakpoint?: string;
  children?: ReactNode;

  small?: boolean;
  medium?: boolean;
  large?: boolean;

  primary?: boolean;
  success?: boolean;
  danger?: boolean;
  warning?: boolean;
  cancel?: boolean;
  white?: boolean;
  purple?: boolean;

  round?: boolean;
  borderless?: boolean;
  onlyIcon?: boolean;
}

const BaseButton = forwardRef(function BaseButton(
  {
    className,
    icon,
    iconRight,
    iconSize,
    iconColor,
    iconVertical,
    labelBreakpoint,
    children,
    ...props
  }: Props,
  ref: Ref<HTMLButtonElement>,
) {
  const variantClasses = BUTTON_VARIANTS.filter(variant => props[variant]).map(
    variant => "Button--" + variant,
  );

  return (
    <button
      {..._.omit(props, ...BUTTON_VARIANTS)}
      className={cx("Button", className, "flex-no-shrink", variantClasses, {
        p1: !children,
      })}
      ref={ref}
    >
      <div
        className={cx("flex layout-centered", { "flex-column": iconVertical })}
        style={iconVertical ? { minWidth: 60 } : undefined}
      >
        {icon && (
          <Icon color={iconColor} name={icon} size={iconSize ? iconSize : 14} />
        )}
        {children && (
          <div
            className={cx({
              [iconVertical ? "mt1" : "ml1"]: icon,
              [iconVertical ? "mb1" : "mr1"]: iconRight,
              [`hide ${labelBreakpoint}-show`]: !!labelBreakpoint,
            })}
          >
            {children}
          </div>
        )}
        {iconRight && (
          <Icon
            color={iconColor}
            name={iconRight}
            size={iconSize ? iconSize : 14}
          />
        )}
      </div>
    </button>
  );
});

const Button = forwardRefToInnerRef(styled(BaseButton)`
  ${color};
  ${space};
`);

Button.displayName = "Button";

export default Button;
