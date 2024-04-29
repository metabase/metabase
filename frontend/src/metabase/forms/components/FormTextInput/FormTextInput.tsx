import { useField } from "formik";
import type { ChangeEvent, FocusEvent, Ref } from "react";
import { forwardRef, useCallback } from "react";

import type { TextInputProps } from "metabase/ui";
import { TextInput } from "metabase/ui";

import { CopyWidgetButton } from "./FormTextInput.styled";

export interface FormTextInputProps
  extends Omit<TextInputProps, "value" | "error"> {
  name: string;
  nullable?: boolean;
  hasCopyButton?: boolean;
}

export const FormTextInput = forwardRef(function FormTextInput(
  {
    name,
    nullable,
    hasCopyButton,
    onChange,
    onBlur,
    ...props
  }: FormTextInputProps,
  ref: Ref<HTMLInputElement>,
) {
  const [{ value }, { error, touched }, { setValue, setTouched }] =
    useField(name);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
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
    (event: FocusEvent<HTMLInputElement>) => {
      setTouched(true);
      onBlur?.(event);
    },
    [setTouched, onBlur],
  );

  return (
    <TextInput
      styles={{
        input: {
          fontWeight: "bold",
        },
      }}
      {...props}
      ref={ref}
      name={name}
      value={value ?? ""}
      error={touched ? error : null}
      onChange={handleChange}
      onBlur={handleBlur}
      rightSection={hasCopyButton ? <CopyWidgetButton value={value} /> : null}
      rightSectionWidth={hasCopyButton ? 40 : undefined}
    />
  );
});
