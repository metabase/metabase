import type { ComponentType } from "react";

export interface FormProps {
  Form: ComponentType<React.PropsWithChildren<unknown>>;
  FormField: ComponentType<React.PropsWithChildren<FormFieldProps>>;
}

export interface FormFieldProps {
  name: string;
  description?: string;
}
