import React, { forwardRef, Ref } from "react";
import { useFormikContext } from "formik";
import Button, { ButtonProps } from "metabase/core/components/Button";

const FormSubmitButton = forwardRef(function FormSubmitButton(
  { disabled, ...props }: ButtonProps,
  ref: Ref<HTMLButtonElement>,
) {
  const { isValid, isSubmitting } = useFormikContext();
  return (
    <Button
      {...props}
      ref={ref}
      disabled={disabled || !isValid || isSubmitting}
    />
  );
});

export default FormSubmitButton;
