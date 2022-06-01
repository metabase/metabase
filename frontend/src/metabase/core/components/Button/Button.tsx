import cx from "classnames";
import React, { ButtonHTMLAttributes, forwardRef, ReactNode, Ref } from "react";
import styled from "@emotion/styled";
import { color, space } from "styled-system";
import _ from "underscore";
import Icon from "metabase/components/Icon";
import {
  ButtonContent,
  ButtonRoot,
  ButtonTextContainer,
} from "./Button.styled";

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
  "fullWidth",
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

  disabled?: boolean;
  round?: boolean;
  borderless?: boolean;
  onlyIcon?: boolean;
  fullWidth?: boolean;
}

const BaseButton = forwardRef(function BaseButton(
  {
    className,
    icon,
    iconRight,
    iconSize,
    iconColor,
    iconVertical = false,
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
    <ButtonRoot
      {..._.omit(props, ...BUTTON_VARIANTS)}
      className={cx("Button", className, variantClasses, {
        p1: !children,
      })}
      ref={ref}
    >
      <ButtonContent iconVertical={iconVertical}>
        {icon && (
          <Icon color={iconColor} name={icon} size={iconSize ? iconSize : 14} />
        )}
        {children && (
          <ButtonTextContainer
            hasIcon={!!icon}
            hasRightIcon={!!iconRight}
            iconVertical={iconVertical}
            className={cx({
              [`hide ${labelBreakpoint}-show`]: !!labelBreakpoint,
            })}
          >
            {children}
          </ButtonTextContainer>
        )}
        {iconRight && (
          <Icon
            color={iconColor}
            name={iconRight}
            size={iconSize ? iconSize : 14}
          />
        )}
      </ButtonContent>
    </ButtonRoot>
  );
});

const Button = styled(BaseButton)`
  ${color};
  ${space};
`;

Button.displayName = "Button";

export default Object.assign(Button, {
  Root: ButtonRoot,
  Content: ButtonContent,
  TextContainer: ButtonTextContainer,
});
