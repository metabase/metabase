import { useState } from "react";

import {
  Flex,
  Icon,
  TextInputBlurChange,
  type TextInputBlurChangeProps,
  TextareaBlurChange,
  type TextareaBlurChangeProps,
} from "metabase/ui";

import S from "./NameDescriptionInput.module.css";

type Props<Base> = Omit<
  Base,
  "normalize" | "value" | "onBlurChange" | "onChange"
> & {
  normalize?: (
    value: string | number | readonly string[] | undefined,
  ) => string;
  value: string;
  onChange: (value: string) => void;
};

export const Input = ({
  normalize,
  required,
  value,
  onChange,
  ...props
}: Props<TextInputBlurChangeProps>) => {
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
        const newNormalizedValue = normalize ? normalize(newValue) : newValue;

        if (newNormalizedValue !== value) {
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

export const Textarea = ({
  normalize,
  required,
  value,
  onChange,
  ...props
}: Props<TextareaBlurChangeProps>) => {
  const [isFocused, setIsFocused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <TextareaBlurChange
      normalize={normalize}
      required={required}
      rightSection={
        <Flex className={S.rightSection}>
          {isHovered && !isFocused ? (
            <Icon name="pencil" size={12} />
          ) : undefined}
        </Flex>
      }
      rightSectionPointerEvents="none"
      value={value}
      onBlur={() => setIsFocused(false)}
      onBlurChange={(event) => {
        const newValue = event.target.value;
        const newNormalizedValue = normalize ? normalize(newValue) : newValue;

        if (newNormalizedValue !== value) {
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
