import type * as React from "react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import _ from "underscore";

import { useUnmountLayout } from "metabase/common/hooks/use-unmount-layout";
import { TextInput, type TextInputProps } from "metabase/ui";

/**
 * A small wrapper around <input>, primarily should be used for the
 * `onBlurChange` feature, otherwise you should use <input> directly
 */

type Value = string | number | null;
type HTMLInputValue = string | number | undefined;

export interface InputBlurChangeProps
  extends Omit<TextInputProps, "inputRef" | "value" | "onBlur"> {
  value: string | undefined;
  onBlurChange?: (event: { target: HTMLInputElement }) => void;
  normalize?: (value: Value) => Value;
}

/** see also: metabase/ui/components/inputs/TextInputBlurChange 🤦‍♀️ */
const InputBlurChange = (props: InputBlurChangeProps) => {
  const {
    value,
    onChange,
    onBlurChange,
    normalize = (value) => value,
    ...restProps
  } = props;
  const [internalValue, setInternalValue] = useState<HTMLInputValue>(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    setInternalValue(value);
  }, [value]);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setInternalValue(event.target.value);

      if (onChange) {
        onChange(event);
        setInternalValue(normalize(event.target.value) ?? undefined);
      }
    },
    [normalize, onChange],
  );

  const handleBlur = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (onBlurChange && (value || "") !== event.target.value) {
        onBlurChange(event);
        setInternalValue(normalize(event.target.value) ?? undefined);
      }
    },
    [normalize, onBlurChange, value],
  );

  useUnmountLayout(() => {
    const lastPropsValue = value || "";
    const currentValue = inputRef.current?.value || "";

    if (onBlurChange && inputRef.current && lastPropsValue !== currentValue) {
      onBlurChange({
        target: inputRef.current,
      });
    }
  });

  const inputProps = _.omit(restProps, "onBlur", "onBlurChange", "onChange");

  return (
    <TextInput
      {...inputProps}
      ref={inputRef}
      value={internalValue}
      onBlur={handleBlur}
      onChange={handleChange}
      styles={{
        input: { width: "100%" },
      }}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default InputBlurChange;
