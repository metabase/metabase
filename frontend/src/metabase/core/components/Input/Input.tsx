import React, {
  forwardRef,
  InputHTMLAttributes,
  MouseEvent,
  ReactNode,
  Ref,
} from "react";
import { t } from "ttag";
import { Icon } from "metabase/core/components/Icon";
import Tooltip from "metabase/core/components/Tooltip";
import { InputSize } from "../../style/types";
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
  leftIcon?: string;
  leftIconTooltip?: ReactNode;
  rightIcon?: string;
  rightIconTooltip?: ReactNode;
  subtitle?: string;
  colorScheme?: InputColorScheme;
  onLeftIconClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  onRightIconClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  onResetClick?: () => void;
}

const Input = forwardRef(function Input(
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(Input, {
  Root: InputRoot,
  Field: InputField,
  Subtitle: InputSubtitle,
});
