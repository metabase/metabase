import type { InputHTMLAttributes, MouseEvent, ReactNode, Ref } from "react";
import { forwardRef } from "react";
import { t } from "ttag";

import Tooltip from "metabase/core/components/Tooltip";
import type { IconName } from "metabase/ui";
import { Icon } from "metabase/ui";

import type { InputSize } from "../../style/types";

import {
  InputField,
  InputLeftButton,
  InputRightButton,
  InputRoot,
  InputSubtitle,
  InputResetButton,
} from "./Input.styled";

export type InputColorScheme = "brand" | "filter";

export type InputAttributes = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "size"
>;

export interface InputProps extends InputAttributes {
  inputRef?: Ref<HTMLInputElement>;
  size?: InputSize;
  error?: boolean;
  fullWidth?: boolean;
  leftIcon?: IconName;
  leftIconTooltip?: ReactNode;
  rightIcon?: IconName;
  rightIconTooltip?: ReactNode;
  subtitle?: string;
  colorScheme?: InputColorScheme;
  onLeftIconClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  onRightIconClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  onResetClick?: () => void;
}

const BaseInput = forwardRef(function Input(
  {
    className,
    style,
    inputRef,
    size = "medium",
    error,
    fullWidth,
    leftIcon,
    leftIconTooltip,
    rightIcon,
    rightIconTooltip,
    subtitle,
    colorScheme = "brand",
    value,
    onLeftIconClick,
    onRightIconClick,
    onResetClick,
    onChange,
    ...props
  }: InputProps,
  ref: Ref<HTMLDivElement>,
) {
  const showResetButton =
    onResetClick && value != null && String(value).length > 0;

  return (
    <InputRoot
      ref={ref}
      className={className}
      style={style}
      fullWidth={fullWidth}
    >
      {subtitle && <InputSubtitle>{subtitle}</InputSubtitle>}

      <InputField
        {...props}
        ref={inputRef}
        fieldSize={size}
        hasError={error}
        fullWidth={fullWidth}
        hasSubtitle={Boolean(subtitle)}
        hasLeftIcon={Boolean(leftIcon)}
        hasRightIcon={Boolean(rightIcon)}
        hasClearButton={showResetButton}
        colorScheme={colorScheme}
        value={value}
        onChange={onChange}
      />
      {leftIcon && (
        <Tooltip tooltip={leftIconTooltip} placement="left">
          <InputLeftButton
            data-testid="input-left-icon-button"
            size={size}
            onClick={onLeftIconClick}
            disabled={!leftIconTooltip && !onLeftIconClick}
          >
            <Icon name={leftIcon} />
          </InputLeftButton>
        </Tooltip>
      )}
      {rightIcon && (
        <Tooltip tooltip={rightIconTooltip} placement="right">
          <InputRightButton
            data-testid="input-right-icon-button"
            size={size}
            onClick={onRightIconClick}
            disabled={!rightIconTooltip && !onRightIconClick}
          >
            <Icon name={rightIcon} />
          </InputRightButton>
        </Tooltip>
      )}

      {showResetButton && (
        <Tooltip tooltip={t`Clear`} placement="right">
          <InputResetButton
            data-testid="input-reset-button"
            size={size}
            hasRightIcon={!!rightIcon}
            onClick={onResetClick}
          >
            <Icon name="close" />
          </InputResetButton>
        </Tooltip>
      )}
    </InputRoot>
  );
});

/**
 * @deprecated: use TextInput from "metabase/ui"
 */
const Input = Object.assign(BaseInput, {
  Root: InputRoot,
  Field: InputField,
  Subtitle: InputSubtitle,
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Input;
