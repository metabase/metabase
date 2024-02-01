import type { ButtonHTMLAttributes, ReactNode, Ref, ElementType } from "react";
import { forwardRef, useImperativeHandle, useRef } from "react";
import cx from "classnames";
import _ from "underscore";
import styled from "@emotion/styled";
import type { IconName } from "metabase/ui";
import { Icon } from "metabase/ui";
import { useContextualPaletteAction } from "metabase/palette/hooks/useContextualPaletteAction";
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

  icon?: IconName | ReactNode;
  iconSize?: number;
  iconColor?: string;
  iconRight?: IconName;
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
  light?: boolean;

  /** To include the button in the command palette when it mounts,
   * set this to true, or to explicitly set the palette options, use an object */
  palette?: boolean | { icon?: string; label?: string };
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
    palette,
    ...props
  }: ButtonProps,
  ref: Ref<HTMLButtonElement>,
) {
  const variantClasses = BUTTON_VARIANTS.filter(variant => props[variant]).map(
    variant => "Button--" + variant,
  );

  const internalRef = useRef<HTMLButtonElement>(null);
  useImperativeHandle(ref, () => internalRef.current as HTMLButtonElement);

  useContextualPaletteAction(
    palette,
    children || props["aria-label"],
    icon,
    internalRef,
  );

  return (
    <ButtonRoot
      ref={internalRef}
      as={as}
      {..._.omit(props, ...BUTTON_VARIANTS)}
      className={cx("Button", className, variantClasses, {
        p1: !children,
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
