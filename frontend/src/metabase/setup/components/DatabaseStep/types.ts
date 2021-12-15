import { ComponentType } from "react";

export interface FormField {
  name: string;
}

export interface FormProps {
  formFields: FormField[];
  Form: ComponentType;
  FormField: ComponentType<FormFieldProps>;
  FormFooter: ComponentType<FormFooterProps>;
}

export interface FormFieldProps {
  name: string;
}

export interface FormFooterProps {
  submitTitle?: string;
  cancelTitle?: string;
  onCancel?: () => void;
}
