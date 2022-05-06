import React from "react";
import _ from "underscore";

import { FormFieldDefinition, FormObject } from "metabase-types/forms";

import {
  BaseFormProps,
  OptionalFormViewProps,
  FormLegacyContext,
  LegacyContextTypes,
} from "./types";

import CustomFormField, { CustomFormFieldProps } from "./CustomFormField";
import CustomFormFooter, { CustomFormFooterProps } from "./CustomFormFooter";
import CustomFormMessage, { CustomFormMessageProps } from "./CustomFormMessage";
import CustomFormSubmit from "./CustomFormSubmit";
import Form from "./Form";

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
  children: React.ReactNode | ((props: FormRenderProps) => JSX.Element);
}

function CustomForm(props: CustomFormProps) {
  const { formObject: form, values, children } = props;
  if (typeof children === "function") {
    return children({
      ...props,
      form,
      formFields: form.fields(values),
      Form: Form,
      FormField: CustomFormField,
      FormSubmit: CustomFormSubmit,
      FormMessage: CustomFormMessage,
      FormFooter: CustomFormFooter,
    });
  }
  return <Form {...props} />;
}

class CustomFormWithLegacyContext extends React.Component<CustomFormProps> {
  static childContextTypes = LegacyContextTypes;

  getChildContext(): FormLegacyContext {
    const {
      fields,
      values,
      formObject: form,
      submitting,
      invalid,
      pristine,
      error,
      handleSubmit,
      submitTitle,
      renderSubmit,
      className,
      style,
      onChangeField,
    } = this.props;
    const { disablePristineSubmit } = form;
    const formFields = form.fields(values);
    const formFieldsByName = _.indexBy(formFields, "name");

    return {
      handleSubmit,
      submitTitle,
      renderSubmit,
      className,
      style,
      fields,
      formFields,
      formFieldsByName,
      values,
      submitting,
      invalid,
      pristine,
      error,
      onChangeField,
      disablePristineSubmit,
    };
  }

  render() {
    return <CustomForm {...this.props} />;
  }
}

export default CustomFormWithLegacyContext;
