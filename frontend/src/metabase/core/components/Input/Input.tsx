import React, { forwardRef, InputHTMLAttributes, ReactNode, Ref } from "react";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import { InputField, InputButton, InputRoot } from "./Input.styled";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  inputRef?: Ref<HTMLInputElement>;
  error?: boolean;
  fullWidth?: boolean;
  leftIcon?: string;
  leftIconTooltip?: ReactNode;
  rightIcon?: string;
  rightIconTooltip?: ReactNode;
}

const Input = forwardRef(function Input(
  {
    className,
    style,
    inputRef,
    error,
    fullWidth,
    leftIcon,
    leftIconTooltip,
    rightIcon,
    rightIconTooltip,
    ...rest
  }: InputProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <InputRoot
      ref={ref}
      className={className}
      style={style}
      fullWidth={fullWidth}
    >
      <InputField
        {...rest}
        ref={inputRef}
        hasError={error}
        fullWidth={fullWidth}
        hasRightIcon={Boolean(rightIcon)}
      />
      {leftIcon && (
        <Tooltip tooltip={leftIconTooltip} placement="left" offset={[0, 24]}>
          <InputButton tabIndex={-1}>
            <Icon name={leftIcon} />
          </InputButton>
        </Tooltip>
      )}
      {rightIcon && (
        <Tooltip tooltip={rightIconTooltip} placement="right" offset={[0, 24]}>
          <InputButton tabIndex={-1}>
            <Icon name={rightIcon} />
          </InputButton>
        </Tooltip>
      )}
    </InputRoot>
  );
});

export default Input;
