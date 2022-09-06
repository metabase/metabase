import { ComponentType } from "react";

import { CustomFormMessageProps } from "metabase/components/form/CustomForm/CustomFormMessage";
import { CustomFormSubmitProps } from "metabase/components/form/CustomForm/CustomFormSubmit";
import { OptionalFormViewProps } from "metabase/components/form/CustomForm/types";

export interface FormField {
  name: string;
}

export interface FormProps {
  Form: ComponentType;
  FormField: ComponentType<FormFieldProps>;
  FormFooter: ComponentType<FormFooterProps>;
  FormSubmit: React.ComponentType<
    CustomFormSubmitProps & OptionalFormViewProps
  >;
  FormMessage: React.ComponentType<CustomFormMessageProps>;
  formFields: FormField[];
  values: FormValues;
  onChangeField: (field: string, value: unknown) => void;
  submitTitle: string;
  error: string;
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
