import React, { ElementType, forwardRef } from "react";
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
  as?: ElementType<HTMLElement>;
  value?: string;
  placeholder?: string;
  onChange: (value: string) => void;
  hasClearButton?: boolean;
  icon?: React.ReactNode;
  colorScheme?: ColorScheme;
  autoFocus?: boolean;
  padding?: Size;
  borderRadius?: Size;
  ref?: any;
  invalid?: boolean;
} & Omit<React.HTMLProps<HTMLInputElement>, "onChange">;

const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  function TextInput(
    {
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
      invalid,
      ...rest
    }: TextInputProps,
    ref,
  ) {
    const handleClear = () => {
      onChange("");
    };

    const showClearButton = hasClearButton && value.length > 0;

    return (
      <TextInputRoot className={className}>
        {icon && <IconWrapper>{icon}</IconWrapper>}
        <Input
          ref={ref}
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
          <ClearButton onClick={handleClear}>
            <Icon name="close" size={12} />
          </ClearButton>
        )}
      </TextInputRoot>
    );
  },
);

export default Object.assign(TextInput, {
  Input,
});
