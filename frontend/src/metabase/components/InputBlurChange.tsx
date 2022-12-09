import React, { useState, useEffect } from "react";
import _ from "underscore";
import Input from "metabase/core/components/Input";
// import { Input } from "./InputBlurChange.styled";

/**
 * A small wrapper around <input>, primarily should be used for the
 * `onBlurChange` feature, otherwise you should use <input> directly
 */

interface InputBlurChangeProps {
  type?: string;
  value: string;
  defaultValue?: string;
  className?: string;
  name?: string;
  id?: string;
  placeholder?: string;
  autoFocus?: boolean;
  error?: boolean;
  fullWidth?: boolean;
  onFocus?: (event: React.FocusEvent<HTMLInputElement>) => void;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onBlurChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
}
const InputBlurChange = ({
  value,
  onChange,
  onBlurChange,
  ...props
}: InputBlurChangeProps) => {
  const [internalValue, setInternalValue] = useState(value);

  useEffect(() => {
    setInternalValue(value);
  }, [value]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInternalValue(event.target.value);
    if (onChange) {
      onChange(event);
    }
  };

  const handleBlur = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (onBlurChange && (value || "") !== event.target.value) {
      onBlurChange(event);
    }
  };

  const inputProps = _.omit(props, "onBlur");

  return (
    <Input
      {...inputProps}
      value={internalValue}
      onBlur={handleBlur}
      onChange={handleChange}
    />
  );
};

export default Object.assign(InputBlurChange, {
  Field: Input.Field,
});
