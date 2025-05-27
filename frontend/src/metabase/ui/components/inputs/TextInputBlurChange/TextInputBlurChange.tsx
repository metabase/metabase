import type { TextInputProps } from "@mantine/core";
import { TextInput } from "@mantine/core";
import type { ChangeEvent } from "react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import _ from "underscore";

import { useUnmountLayout } from "metabase/hooks/use-unmount-layout";

type TextInputRestProps = Omit<TextInputProps, "onBlur" | "ref">;

export type TextInputBlurChangeProps<
  T extends TextInputRestProps = TextInputRestProps,
> = T & {
  value: T["value"] | undefined;
  onBlurChange: (event: { target: HTMLInputElement }) => void;
  normalize?: (value?: T["value"] | undefined) => T["value"] | undefined;
};

/**
 * A wrapper around TextInput to be used with onBlurChange prop.
 *
 * In case you don't need it, use TextInput directly.
 */
export function TextInputBlurChange<T extends TextInputProps = TextInputProps>({
  value,
  onChange,
  onBlurChange,
  normalize = (value) => value,
  ...restProps
}: TextInputBlurChangeProps<T>) {
  const [internalValue, setInternalValue] = useState<T["value"]>();
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
