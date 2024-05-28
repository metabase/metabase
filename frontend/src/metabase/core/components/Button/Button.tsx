import styled from "@emotion/styled";
import cx from "classnames";
import type { ButtonHTMLAttributes, ReactNode, ElementType, Ref } from "react";
import { forwardRef } from "react";
import _ from "underscore";

import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import SpacingS from "metabase/css/core/spacing.module.css";
import { isNotNull } from "metabase/lib/types";
import type { IconName } from "metabase/ui";
import { Icon } from "metabase/ui";

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
  "white",
  "borderless",
  "onlyIcon",
  "fullWidth",
] as const;

const VARIANT_TO_CLASS_MAP: {
  [key: string]: string;
} = {
  small: ButtonsS.ButtonSmall,
  medium: ButtonsS.ButtonMedium,
  large: ButtonsS.ButtonLarge,
  round: ButtonsS.ButtonRound,
  primary: ButtonsS.ButtonPrimary,
  danger: ButtonsS.ButtonDanger,
  warning: ButtonsS.ButtonWarning,
  cancel: ButtonsS.ButtonCancel,
  success: ButtonsS.ButtonSuccess,
  white: ButtonsS.ButtonWhite,
  borderless: ButtonsS.ButtonBorderless,
  onlyIcon: ButtonsS.ButtonOnlyIcon,
  fullWidth: ButtonsS.ButtonFullWidth,
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  as?: ElementType;
  className?: string;
  to?: string;
  tooltip?: string; // available when using as={Link}
  href?: string;

  icon?: IconName | ReactNode;
  iconSize?: number;
  iconColor?: string;
  iconRight?: IconName;
  iconVertical?: boolean;
  labelBreakpoint?: "sm";
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
  light?: boolean;
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
  const variantClasses = BUTTON_VARIANTS.filter(variant => props[variant])
    .map(variant => VARIANT_TO_CLASS_MAP[variant])
    .filter(isNotNull);

  return (
    <ButtonRoot
      ref={ref}
      as={as}
      {..._.omit(props, ...BUTTON_VARIANTS)}
      className={cx(ButtonsS.Button, className, variantClasses, {
        [SpacingS.p1]: !children,
      })}
      purple={props.purple}
    >
      <ButtonContent iconVertical={iconVertical}>
        {icon && typeof icon === "string" ? (
          <Icon
            color={iconColor}
            name={icon as unknown as IconName}
            size={iconSize ? iconSize : 16}
          />
        ) : (
          icon
        )}
        {children && (
          <ButtonTextContainer
            hasIcon={!!icon}
            hasRightIcon={!!iconRight}
            iconVertical={iconVertical}
            className={
              labelBreakpoint === "sm" ? cx(CS.hide, CS.smShow) : undefined
            }
          >
            {children}
          </ButtonTextContainer>
        )}
        {iconRight && (
          <Icon
            color={iconColor}
            name={iconRight}
            size={iconSize ? iconSize : 16}
          />
        )}
      </ButtonContent>
    </ButtonRoot>
  );
});

const StyledButton = styled(BaseButton)``;

StyledButton.displayName = "Button";

/**
 * @deprecated: use Button from "metabase/ui"
 */
const Button = Object.assign(StyledButton, {
  Root: ButtonRoot,
  Content: ButtonContent,
  TextContainer: ButtonTextContainer,
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Button;
