import type { TextareaProps } from "@mantine/core";
import type { ChangeEvent, FocusEvent } from "react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { useUnmountLayout } from "metabase/hooks/use-unmount-layout";

import { Textarea } from "../Textarea";

type TextareaRestProps = Omit<TextareaProps, "onBlur" | "ref">;

export type TextareaBlurChangeProps<
  T extends TextareaRestProps = TextareaRestProps,
> = T & {
  normalize?: (value?: T["value"] | undefined) => T["value"] | undefined;
  value: T["value"] | undefined;
  onBlurChange: (event: { target: HTMLTextAreaElement }) => void;
};

/**
 * A wrapper around Textarea to be used with onBlurChange prop.
 *
 * In case you don't need it, use Textarea directly.
 *
 * If you're modifying this component, make the same change in TextInputBlurChange.
 */
export function TextareaBlurChange<T extends TextareaProps = TextareaProps>({
  normalize = (value) => value,
  value,
  onBlur,
  onBlurChange,
  onChange,
  ...props
}: TextareaBlurChangeProps<T>) {
  const [internalValue, setInternalValue] = useState<T["value"]>();
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => setInternalValue(value), [value]);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setInternalValue(event.target.value);

      if (onChange) {
        onChange(event);
        setInternalValue(normalize(event.target.value));
      }
    },
    [normalize, onChange],
  );

  const handleBlur = useCallback(
    (event: FocusEvent<HTMLTextAreaElement>) => {
      onBlur?.(event);

      if (onBlurChange && (value || "") !== event.target.value) {
        onBlurChange(event);
        setInternalValue(normalize(event.target.value) ?? undefined);
      }
    },
    [normalize, onBlur, onBlurChange, value],
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

  return (
    <Textarea
      {...props}
      ref={ref}
      value={internalValue}
      onBlur={handleBlur}
      onChange={handleChange}
    />
  );
}
