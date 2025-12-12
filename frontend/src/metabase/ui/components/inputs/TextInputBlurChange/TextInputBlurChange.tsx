import type { TextInputProps } from "@mantine/core";
import { TextInput } from "@mantine/core";
import type { ChangeEvent, FocusEvent, KeyboardEvent } from "react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { useUnmountLayout } from "metabase/common/hooks/use-unmount-layout";

type TextInputRestProps = Omit<TextInputProps, "onBlur" | "ref">;

export type TextInputBlurChangeProps<
  T extends TextInputRestProps = TextInputRestProps,
> = T & {
  normalize?: (value?: T["value"] | undefined) => T["value"] | undefined;
  resetOnEsc?: boolean;
  value: T["value"] | undefined;
  onBlurChange?: (event: { target: HTMLInputElement }) => void;
};

/**
 * A wrapper around TextInput to be used with onBlurChange prop.
 *
 * In case you don't need it, use TextInput directly.
 *
 * If you're modifying this component, make the same change in TextareaBlurChange.
 */
export function TextInputBlurChange<T extends TextInputProps = TextInputProps>({
  normalize = (value) => value,
  resetOnEsc,
  value,
  onBlur,
  onBlurChange,
  onChange,
  ...props
}: TextInputBlurChangeProps<T>) {
  const [internalValue, setInternalValue] = useState<T["value"]>("");
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
    (event: FocusEvent<HTMLInputElement>) => {
      onBlur?.(event);

      if (onBlurChange && (value || "") !== event.target.value) {
        onBlurChange(event);
        setInternalValue(normalize(event.target.value) ?? undefined);
      }
    },
    [normalize, onBlur, onBlurChange, value],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (resetOnEsc && event.key === "Escape") {
        flushSync(() => setInternalValue(value));
        ref.current?.blur();
      }
    },
    [ref, resetOnEsc, value],
  );

  useUnmountLayout(() => {
    const lastPropsValue = value || "";
    const currentValue = ref.current?.value || "";

    if (onBlurChange && ref.current && lastPropsValue !== currentValue) {
      onBlurChange({
        target: ref.current,
      });
    }
  });

  return (
    <TextInput
      {...props}
      ref={ref}
      value={internalValue}
      onBlur={handleBlur}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
    />
  );
}
