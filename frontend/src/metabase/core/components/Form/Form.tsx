import React, { FormHTMLAttributes, forwardRef, Ref } from "react";
import { useFormikContext } from "formik";

export interface FormProps
  extends Omit<FormHTMLAttributes<HTMLFormElement>, "onSubmit" | "onReset"> {
  disabled?: boolean;
}

const Form = forwardRef(function Form(
  { disabled, ...props }: FormProps,
  ref: Ref<HTMLFormElement>,
) {
  const { handleSubmit, handleReset } = useFormikContext();

  return (
    <form
      {...props}
      ref={ref}
      onSubmit={!disabled ? handleSubmit : undefined}
      onReset={!disabled ? handleReset : undefined}
    />
  );
});

export default Form;
