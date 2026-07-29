import { useField, useFormikContext } from "formik";
import type { FocusEvent, Ref } from "react";
import { forwardRef, useCallback } from "react";

import type { FileInputProps } from "metabase/ui";
import { FileInput } from "metabase/ui";

export interface FormFileInputProps extends Omit<
  FileInputProps<false>,
  "value" | "error" | "onChange"
> {
  name: string;
}

export const FormFileInput = forwardRef(function FormFileInput(
  { name, onBlur, ...props }: FormFileInputProps,
  ref: Ref<HTMLButtonElement>,
) {
  const [{ value }, { error, touched }, { setValue, setTouched }] =
    useField<File | null>(name);
  const { validateOnMount } = useFormikContext();

  const handleChange = useCallback(
    (file: File | null) => {
      setValue(file);
    },
    [setValue],
  );

  const handleBlur = useCallback(
    (event: FocusEvent<HTMLButtonElement>) => {
      setTouched(true);
      onBlur?.(event);
    },
    [setTouched, onBlur],
  );

  return (
    <FileInput
      {...props}
      ref={ref}
      name={name}
      value={value ?? null}
      error={(validateOnMount || touched) && error ? error : null}
      onChange={handleChange}
      onBlur={handleBlur}
      errorProps={{ role: "alert" }}
    />
  );
});
