import { useField } from "formik";
import type { ChangeEvent, FocusEvent, Ref } from "react";
import { forwardRef, useCallback } from "react";

import type { SwitchProps } from "metabase/ui";
import { Switch } from "metabase/ui";

export interface FormSwitchProps extends Omit<SwitchProps, "value" | "error"> {
  name: string;
}

export const FormSwitch = forwardRef(function FormSwitch(
  { name, onChange, onBlur, ...props }: FormSwitchProps,
  ref: Ref<HTMLInputElement>,
) {
  const [{ value }, { error, touched }, { setValue, setTouched }] =
    useField(name);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setValue(event.target.checked);
      onChange?.(event);
    },
    [setValue, onChange],
  );

  const handleBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      setTouched(true);
      onBlur?.(event);
    },
    [setTouched, onBlur],
  );

  return (
    <Switch
      {...props}
      ref={ref}
      checked={value ?? false}
      error={touched ? error : null}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
});
