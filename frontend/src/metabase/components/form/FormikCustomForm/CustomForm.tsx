import { Form } from "formik";
import type * as React from "react";

import type {
  BaseFieldValues,
  FormFieldDefinition,
  PopulatedFormObject,
} from "metabase-types/forms";

import type { CustomFormFieldProps } from "./CustomFormField";
import CustomFormField from "./CustomFormField";
import type { CustomFormFooterProps } from "./CustomFormFooter";
import CustomFormFooter from "./CustomFormFooter";
import type { CustomFormMessageProps } from "./CustomFormMessage";
import CustomFormMessage from "./CustomFormMessage";
import CustomFormSubmit from "./CustomFormSubmit";
import { FormContext } from "./context";
import type { BaseFormProps, OptionalFormViewProps } from "./types";

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

type Children<Values> =
  | React.ReactNode
  | ((props: FormRenderProps<Values>) => JSX.Element);

export interface CustomFormProps<Values extends BaseFieldValues>
  extends BaseFormProps<Values>,
    OptionalFormViewProps {
  children?: Children<Values>;
}

// HACK: to supress TS typings from React v18 upgrade
const isChildrenReactNode = <Values = unknown,>(
  children: Children<Values>,
): children is React.ReactNode => {
  return typeof children !== "function";
};

/**
 * @deprecated
 */
function CustomForm<Values extends BaseFieldValues>(
  props: CustomFormProps<Values>,
) {
  const { formObject: form, values, children } = props;
  if (!isChildrenReactNode(children)) {
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
      <Form {...props}>{children}</Form>
    </FormContext.Provider>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CustomForm;
