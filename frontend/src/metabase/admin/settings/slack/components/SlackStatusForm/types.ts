import type { ComponentType } from "react";

export interface FormProps {
  Form: ComponentType;
  FormField: ComponentType<FormFieldProps>;
}

export interface FormFieldProps {
  name: string;
  description?: string;
}
