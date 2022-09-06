import { ComponentType } from "react";

export interface FormField {
  name: string;
}

export interface FormProps {
  Form: ComponentType;
  FormField: ComponentType<FormFieldProps>;
  FormSubmit: ComponentType<FormSubmitProps>;
}

export interface FormFieldProps {
  name: string;
}

export interface FormSubmitProps {
  primary?: boolean;
  submitTitle?: string;
}
