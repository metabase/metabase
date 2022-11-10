import React from "react";
import _ from "underscore";

import {
  FormFieldDefinition,
  PopulatedFormObject,
} from "metabase-types/forms/legacy";

import {
  BaseFormProps,
  OptionalFormViewProps,
  CustomFormLegacyContext,
  LegacyContextTypes,
} from "./types";

import CustomFormField, { CustomFormFieldProps } from "./CustomFormField";
import CustomFormFooter, { CustomFormFooterProps } from "./CustomFormFooter";
import CustomFormMessage, { CustomFormMessageProps } from "./CustomFormMessage";
import CustomFormSubmit from "./CustomFormSubmit";
import Form from "./Form";

interface FormRenderProps extends BaseFormProps {
  form: PopulatedFormObject;
  formFields: FormFieldDefinition[];
  Form: React.ComponentType<{ children: React.ReactNode }>;
  FormField: React.ComponentType<CustomFormFieldProps>;
  FormSubmit: React.ComponentType<{ children: React.ReactNode }>;
  FormMessage: React.ComponentType<CustomFormMessageProps>;
  FormFooter: React.ComponentType<CustomFormFooterProps>;
}

interface CustomFormProps extends BaseFormProps, OptionalFormViewProps {
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

/**
 * @deprecated
 */
class CustomFormWithLegacyContext extends React.Component<CustomFormProps> {
  static childContextTypes = LegacyContextTypes;

  getChildContext(): CustomFormLegacyContext {
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
