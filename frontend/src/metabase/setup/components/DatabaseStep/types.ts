import { ComponentType } from "react";

export interface FormField {
  name: string;
}

export interface FormProps {
  Form: ComponentType;
  FormField: ComponentType<FormFieldProps>;
  FormFooter: ComponentType<FormFooterProps>;
  formFields: FormField[];
  values: FormValues;
  onChangeField: (field: string, value: unknown) => void;
}

export interface FormValues {
  engine?: string;
}

export interface FormFieldProps {
  name: string;
  onChange?: (value?: string) => void;
}

export interface FormFooterProps {
  submitTitle?: string;
  cancelTitle?: string;
  onCancel?: () => void;
}
