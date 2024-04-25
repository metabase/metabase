import { useField } from "formik";
import type { ChangeEvent, FocusEvent, Ref } from "react";
import { forwardRef, useCallback } from "react";

import type { TextareaProps } from "metabase/ui";
import { Textarea } from "metabase/ui";

export interface FormTextareaProps
  extends Omit<TextareaProps, "value" | "error"> {
  name: string;
  nullable?: boolean;
}

export const FormTextarea = forwardRef(function FormTextarea(
  { name, nullable, onChange, onBlur, ...props }: FormTextareaProps,
  ref: Ref<HTMLTextAreaElement>,
) {
  const [{ value }, { error, touched }, { setValue, setTouched }] =
    useField(name);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = event.target.value;
      if (newValue === "") {
        setValue(nullable ? null : undefined);
      } else {
        setValue(newValue);
      }
      onChange?.(event);
    },
    [nullable, setValue, onChange],
  );

  const handleBlur = useCallback(
    (event: FocusEvent<HTMLTextAreaElement>) => {
      setTouched(true);
      onBlur?.(event);
    },
    [setTouched, onBlur],
  );

  return (
    <Textarea
      {...props}
      ref={ref}
      name={name}
      value={value ?? ""}
      error={touched ? error : null}
      onChange={handleChange}
      onBlur={handleBlur}
      styles={{
        input: {
          fontWeight: "bold",
        },
      }}
    />
  );
});
