import type { TextInputProps } from "@mantine/core";
import { TextInput } from "@mantine/core";
import type { ChangeEvent } from "react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import _ from "underscore";

import { useUnmountLayout } from "metabase/hooks/use-unmount-layout";

type Value = string | undefined;

export interface TextInputBlurChangeProps
  extends Omit<TextInputProps, "value" | "onBlur" | "ref"> {
  value: Value;
  onBlurChange: (event: { target: HTMLInputElement }) => void;
  normalize?: (value: Value) => Value;
}

/**
 * A wrapper around TextInput to be used with onBlurChange prop.
 *
 * In case you don't need it, use TextInput directly.
 */
export function TextInputBlurChange({
  value,
  onChange,
  onBlurChange,
  normalize = value => value,
  ...restProps
}: TextInputBlurChangeProps) {
  const [internalValue, setInternalValue] = useState<Value>();
  const ref = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => setInternalValue(value), [value]);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setInternalValue(event.target.value);

      if (onChange) {
        onChange(event);
        setInternalValue(normalize(event.target.value));
      }
    },
    [normalize, onChange],
  );

  const handleBlur = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (onBlurChange && (value || "") !== event.target.value) {
        onBlurChange(event);
        setInternalValue(normalize(event.target.value) ?? undefined);
      }
    },
    [normalize, onBlurChange, value],
  );

  useUnmountLayout(() => {
    const lastPropsValue = value || "";
    const currentValue = ref.current?.value || "";

    if (ref.current && lastPropsValue !== currentValue) {
      onBlurChange({
        target: ref.current,
      });
    }
  });

  const inputProps = _.omit(restProps, "onBlur", "onChange", "ref");

  return (
    <TextInput
      {...inputProps}
      ref={ref}
      value={internalValue}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
}
