import { useState, useLayoutEffect, useCallback } from "react";
import * as React from "react";
import _ from "underscore";
import Input, { InputProps } from "metabase/core/components/Input";

/**
 * A small wrapper around <input>, primarily should be used for the
 * `onBlurChange` feature, otherwise you should use <input> directly
 */

interface InputBlurChangeProps extends Omit<InputProps, "onBlur"> {
  onBlurChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

const InputBlurChange = ({
  value,
  onChange,
  onBlurChange,
  ...props
}: InputBlurChangeProps) => {
  const [internalValue, setInternalValue] = useState(value);

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

  const inputProps = _.omit(props, "onBlur", "onBlurChange", "onChange");

  return (
    <Input
      {...inputProps}
      value={internalValue}
      onBlur={handleBlur}
      onChange={handleChange}
      fullWidth
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default InputBlurChange;
