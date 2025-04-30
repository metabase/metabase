import { type FocusEvent, useLayoutEffect, useState } from "react";

import { Flex, Icon, TextInput, type TextInputProps } from "metabase/ui";

import S from "./NameDescriptionInput.module.css";

interface Props extends Omit<TextInputProps, "onChange"> {
  onChange: (value: string) => void;
}

/**
 * Controlled component that fires on*Change events on blur
 */
export const TextInputBlurChange = ({
  required,
  value,
  onChange,
  ...props
}: Props) => {
  const [valueState, setValueState] = useState(value);
  const [isFocused, setIsFocused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);

    const newValue = event.target.value;
    const isNewValueEmpty = newValue.trim().length === 0;

    if (required && isNewValueEmpty) {
      setValueState(value);
      return;
    }

    if (value !== newValue) {
      onChange(newValue);
    }
  };

  useLayoutEffect(() => {
    setValueState(value);
  }, [value]);

  return (
    <TextInput
      required={required}
      rightSection={
        isHovered && !isFocused ? (
          <Flex className={S.rightSection}>
            <Icon name="pencil" size={12} />
          </Flex>
        ) : undefined
      }
      rightSectionPointerEvents="none"
      value={valueState}
      onBlur={handleBlur}
      onChange={(event) => setValueState(event.target.value)}
      onFocus={() => setIsFocused(true)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      {...props}
    />
  );
};
