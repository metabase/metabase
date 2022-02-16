import React, { forwardRef, InputHTMLAttributes, ReactNode, Ref } from "react";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import { InputField, InputIconContainer, InputRoot } from "./Input.styled";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  className?: string;
  error?: boolean;
  fullWidth?: boolean;
  borderless?: boolean;
  helperText?: ReactNode;
}

const Input = forwardRef(function Input(
  { className, error, fullWidth, borderless, helperText, ...rest }: InputProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <InputRoot ref={ref} className={className} fullWidth={fullWidth}>
      <InputField
        {...rest}
        hasError={error}
        hasTooltip={Boolean(helperText)}
        fullWidth={fullWidth}
        borderless={borderless}
      />
      {helperText && (
        <Tooltip tooltip={helperText} placement="right" offset={[0, 24]}>
          <InputIconContainer>
            <Icon name="info" />
          </InputIconContainer>
        </Tooltip>
      )}
    </InputRoot>
  );
});

export default Input;
