import React from "react";
import { Form } from "formik";

import {
  BaseFieldValues,
  FormFieldDefinition,
  PopulatedFormObject,
} from "metabase-types/forms";

import { BaseFormProps, OptionalFormViewProps } from "./types";

import CustomFormField, { CustomFormFieldProps } from "./CustomFormField";
import CustomFormFooter, { CustomFormFooterProps } from "./CustomFormFooter";
import CustomFormMessage, { CustomFormMessageProps } from "./CustomFormMessage";
import CustomFormSubmit from "./CustomFormSubmit";

import { FormContext } from "./context";

interface FormRenderProps<Values extends BaseFieldValues>
  extends BaseFormProps<Values> {
  form: PopulatedFormObject<Values>;
  formFields: FormFieldDefinition[];
  Form: React.ComponentType<{ children: React.ReactNode }>;
  FormField: React.ComponentType<CustomFormFieldProps>;
  FormSubmit: React.ComponentType<{ children: React.ReactNode }>;
  FormMessage: React.ComponentType<CustomFormMessageProps>;
  FormFooter: React.ComponentType<CustomFormFooterProps>;
}

export interface CustomFormProps<Values extends BaseFieldValues>
  extends BaseFormProps<Values>,
    OptionalFormViewProps {
  children?:
    | React.ReactNode
    | ((props: FormRenderProps<Values>) => JSX.Element);
}

/**
 * @deprecated
 */
function CustomForm<Values extends BaseFieldValues>(
  props: CustomFormProps<Values>,
) {
  const { formObject: form, values, children } = props;
  if (typeof children === "function") {
    return (
      <FormContext.Provider value={props}>
        {children({
          ...props,
          form,
          formFields: form.fields(values),
          Form,
          FormField: CustomFormField,
          FormSubmit: CustomFormSubmit,
          FormMessage: CustomFormMessage,
          FormFooter: CustomFormFooter,
        })}
      </FormContext.Provider>
    );
  }

  return (
    <FormContext.Provider value={props}>
      <Form {...props} />
    </FormContext.Provider>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CustomForm;
