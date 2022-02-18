import React, { forwardRef, InputHTMLAttributes, ReactNode, Ref } from "react";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import { InputField, InputIconButton, InputRoot } from "./Input.styled";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  inputRef?: Ref<HTMLInputElement>;
  error?: boolean;
  fullWidth?: boolean;
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
      {rightIcon && (
        <Tooltip tooltip={rightIconTooltip} placement="right" offset={[0, 24]}>
          <InputIconButton tabIndex={-1}>
            <Icon name={rightIcon} />
          </InputIconButton>
        </Tooltip>
      )}
    </InputRoot>
  );
});

export default Input;
