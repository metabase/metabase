import { ComponentType } from "react";

export interface FormProps {
  Form: ComponentType;
  FormField: ComponentType<FormFieldProps>;
  FormFooter: ComponentType<FormFooterProps>;
}

export interface FormFieldProps {
  name: string;
}

export interface FormFooterProps {
  submitTitle?: string;
}

export interface FormError {
  data: FormDataError;
}

export interface FormDataError {
  errors: Record<string, unknown>;
}
