import React, { forwardRef, Ref } from "react";
import { useFormikContext } from "formik";
import Button, { ButtonProps } from "metabase/core/components/Button";

export type FormSubmitButtonProps = ButtonProps;

const FormSubmitButton = forwardRef(function FormSubmitButton(
  { disabled, ...props }: FormSubmitButtonProps,
  ref: Ref<HTMLButtonElement>,
) {
  const { isValid, isSubmitting } = useFormikContext();
  return (
    <Button
      {...props}
      ref={ref}
      type="submit"
      disabled={disabled || !isValid || isSubmitting}
    />
  );
});

export default FormSubmitButton;
