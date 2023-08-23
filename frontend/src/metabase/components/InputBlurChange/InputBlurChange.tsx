import type * as React from "react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import _ from "underscore";
import { useUnmount } from "react-use";
import type { InputProps } from "metabase/core/components/Input";
import Input from "metabase/core/components/Input";

/**
 * A small wrapper around <input>, primarily should be used for the
 * `onBlurChange` feature, otherwise you should use <input> directly
 */

export interface InputBlurChangeProps
  extends Omit<InputProps, "inputRef" | "value" | "onBlur"> {
  value: string | undefined;
  onBlurChange?: (event: { target: HTMLInputElement }) => void;
}

const InputBlurChange = (props: InputBlurChangeProps) => {
  const { value, onChange, onBlurChange, ...restProps } = props;
  const [internalValue, setInternalValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    setInternalValue(value);
  }, [value]);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setInternalValue(event.target.value);

      if (onChange) {
        onChange(event);
      }
    },
    [onChange],
  );

  const handleBlur = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (onBlurChange && (value || "") !== event.target.value) {
        onBlurChange(event);
      }
    },
    [value, onBlurChange],
  );

  useUnmount(() => {
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
    <Input
      {...inputProps}
      inputRef={inputRef}
      value={internalValue}
      onBlur={handleBlur}
      onChange={handleChange}
      fullWidth
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default InputBlurChange;
