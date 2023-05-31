import cx from "classnames";
import {
  ButtonHTMLAttributes,
  forwardRef,
  ReactNode,
  Ref,
  ElementType,
} from "react";
import styled from "@emotion/styled";
import { color, space } from "styled-system";
import type { SpaceProps } from "styled-system";
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

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  as?: ElementType;
  className?: string;
  to?: string;
  tooltip?: string; // available when using as={Link}
  href?: string;

  icon?: string | ReactNode;
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
  onlyText?: boolean;
}

const BaseButton = forwardRef(function BaseButton(
  {
    as,
    className,
    icon,
    iconRight,
    iconSize,
    iconColor,
    iconVertical = false,
    labelBreakpoint,
    children,
    ...props
  }: ButtonProps,
  ref: Ref<HTMLButtonElement>,
) {
  const variantClasses = BUTTON_VARIANTS.filter(variant => props[variant]).map(
    variant => "Button--" + variant,
  );

  return (
    <ButtonRoot
      ref={ref}
      as={as}
      {..._.omit(props, ...BUTTON_VARIANTS)}
      className={cx("Button", className, variantClasses, {
        p1: !children,
      })}
      purple={props.purple}
    >
      <ButtonContent iconVertical={iconVertical}>
        {icon && typeof icon === "string" ? (
          <Icon color={iconColor} name={icon} size={iconSize ? iconSize : 14} />
        ) : (
          icon
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

const Button = styled(BaseButton)<SpaceProps>`
  ${color};
  ${space};
`;

Button.displayName = "Button";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(Button, {
  Root: ButtonRoot,
  Content: ButtonContent,
  TextContainer: ButtonTextContainer,
});
