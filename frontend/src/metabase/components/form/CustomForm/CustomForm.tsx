import React, { createContext, useContext } from "react";
import _ from "underscore";
import { Form } from "formik";

import { FormFieldDefinition, FormObject } from "metabase-types/forms";

import { BaseFormProps, OptionalFormViewProps } from "./types";

import CustomFormField, { CustomFormFieldProps } from "./CustomFormField";
import CustomFormFooter, { CustomFormFooterProps } from "./CustomFormFooter";
import CustomFormMessage, { CustomFormMessageProps } from "./CustomFormMessage";
import CustomFormSubmit from "./CustomFormSubmit";

import { FormContext } from "./context";

interface FormRenderProps extends BaseFormProps {
  form: FormObject;
  formFields: FormFieldDefinition[];
  Form: React.ComponentType<{ children: React.ReactNode }>;
  FormField: React.ComponentType<CustomFormFieldProps>;
  FormSubmit: React.ComponentType<{ children: React.ReactNode }>;
  FormMessage: React.ComponentType<CustomFormMessageProps>;
  FormFooter: React.ComponentType<CustomFormFooterProps>;
}

export interface CustomFormProps extends BaseFormProps, OptionalFormViewProps {
  children?: React.ReactNode | ((props: FormRenderProps) => JSX.Element);
}

function CustomForm(props: CustomFormProps) {
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

export default CustomForm;
