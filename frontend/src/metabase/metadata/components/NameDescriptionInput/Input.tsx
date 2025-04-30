import { useState } from "react";

import {
  Flex,
  Icon,
  TextInputBlurChange,
  type TextInputBlurChangeProps,
} from "metabase/ui";

import S from "./NameDescriptionInput.module.css";

interface Props
  extends Omit<
    TextInputBlurChangeProps,
    "normalize" | "value" | "onBlurChange" | "onChange"
  > {
  normalize?: (
    value: string | number | readonly string[] | undefined,
  ) => string;
  value: string;
  onChange: (value: string) => void;
}

export const Input = ({
  normalize,
  required,
  value,
  onChange,
  ...props
}: Props) => {
  const [isFocused, setIsFocused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <TextInputBlurChange
      normalize={normalize}
      required={required}
      rightSection={
        isHovered && !isFocused ? (
          <Flex className={S.rightSection}>
            <Icon name="pencil" size={12} />
          </Flex>
        ) : undefined
      }
      rightSectionPointerEvents="none"
      value={value}
      onBlur={() => setIsFocused(false)}
      onBlurChange={(event) => {
        const newValue = event.target.value;
        const normalizedValue = normalize ? normalize(newValue) : newValue;

        if (normalizedValue !== value) {
          onChange(event.target.value);
        }
      }}
      onFocus={() => setIsFocused(true)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      {...props}
    />
  );
};
