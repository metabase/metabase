import React, { FormHTMLAttributes, forwardRef, Ref } from "react";
import { Form as FormikForm } from "formik";

export type FormProps = FormHTMLAttributes<HTMLFormElement>;

const Form = forwardRef(function Form(
  props: FormProps,
  ref: Ref<HTMLFormElement>,
) {
  return <FormikForm {...props} ref={ref} />;
});

export default Form;
