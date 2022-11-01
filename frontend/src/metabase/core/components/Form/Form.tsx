import React, {
  FormHTMLAttributes,
  forwardRef,
  Ref,
  SyntheticEvent,
} from "react";
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
      onSubmit={!disabled ? handleSubmit : handleDisabledEvent}
      onReset={!disabled ? handleReset : handleDisabledEvent}
    />
  );
});

const handleDisabledEvent = (event: SyntheticEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

export default Form;
