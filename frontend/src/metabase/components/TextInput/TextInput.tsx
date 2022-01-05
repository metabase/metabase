import React, { forwardRef } from "react";
import { t } from "ttag";

import Icon from "metabase/components/Icon";

import {
  TextInputRoot,
  ClearButton,
  IconWrapper,
  Input,
} from "./TextInput.styled";

export type ColorScheme = "default" | "admin" | "transparent";
export type Size = "sm" | "md";

type TextInputProps = {
  value?: string;
  placeholder?: string;
  onChange: (value: string) => void;
  hasClearButton?: boolean;
  icon?: React.ReactNode;
  colorScheme?: ColorScheme;
  autoFocus?: boolean;
  padding?: Size;
  borderRadius?: Size;
  innerRef?: any;
  invalid?: boolean;
} & Omit<React.HTMLProps<HTMLInputElement>, "onChange">;

function TextInput({
  value = "",
  className,
  placeholder = t`Find...`,
  onChange,
  hasClearButton = false,
  icon,
  type = "text",
  colorScheme = "default",
  autoFocus = false,
  padding = "md",
  borderRadius = "md",
  innerRef,
  ref,
  invalid,
  ...rest
}: TextInputProps) {
  const handleClearClick = () => {
    onChange("");
  };

  const showClearButton = hasClearButton && value.length > 0;

  return (
    <TextInputRoot className={className}>
      {icon && <IconWrapper>{icon}</IconWrapper>}
      <Input
        innerRef={innerRef}
        colorScheme={colorScheme}
        autoFocus={autoFocus}
        hasClearButton={hasClearButton}
        hasIcon={!!icon}
        placeholder={placeholder}
        value={value}
        type={type}
        onChange={e => onChange(e.target.value)}
        padding={padding}
        borderRadius={borderRadius}
        invalid={invalid}
        {...rest}
      />

      {showClearButton && (
        <ClearButton onClick={handleClearClick}>
          <Icon name="close" size={12} />
        </ClearButton>
      )}
    </TextInputRoot>
  );
}

export default forwardRef<HTMLInputElement, TextInputProps>(
  function TextInputForwardRef(props, ref) {
    return <TextInput {...props} innerRef={ref} />;
  },
);
