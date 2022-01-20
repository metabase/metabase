import React, { forwardRef, InputHTMLAttributes, ReactNode } from "react";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import { InputField, InputIconContainer, InputRoot } from "./Input.styled";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  className?: string;
  error?: boolean;
  fullWidth?: boolean;
  helperText?: ReactNode;
}

const Input = ({
  className,
  error,
  fullWidth,
  helperText,
  ...rest
}: InputProps) => {
  return (
    <InputRoot className={className} fullWidth={fullWidth}>
      <InputField
        {...rest}
        hasError={error}
        hasTooltip={Boolean(helperText)}
        fullWidth={fullWidth}
      />
      {helperText && (
        <Tooltip tooltip={helperText} placement="right" offset={[0, 24]}>
          <InputHelpContent />
        </Tooltip>
      )}
    </InputRoot>
  );
};

const InputHelpContent = forwardRef(function InputHelpContent(props, ref: any) {
  return (
    <InputIconContainer innerRef={ref}>
      <Icon name="info" />
    </InputIconContainer>
  );
});

export default Input;
