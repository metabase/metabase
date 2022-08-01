import React, { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";
import { merge } from "icepick";

// eslint-disable-next-line import/named
import { Formik, FormikProps, FormikHelpers } from "formik";

import {
  FormFieldDefinition,
  FormObject,
  FieldValues,
  BaseFieldDefinition,
} from "metabase-types/forms";

import FormikFormViewAdapter from "./FormikFormViewAdapter";
import useInlineFields from "./useInlineFields";
import { makeFormObject, cleanObject } from "../formUtils";

interface FormContainerProps {
  form?: FormObject;

  fields?: FormFieldDefinition[];
  initialValues?: FieldValues;

  overwriteOnInitialValuesChange?: boolean;

  validate?: () => void;
  initial?: () => void;
  normalize?: () => void;

  onSubmit: (values: FieldValues) => Promise<void>;
  onSubmitSuccess: (action: unknown) => void;
}

type ServerErrorResponse = {
  data?:
    | {
        message?: string;
        errors?: Record<string, string>;
      }
    | string;
  errors?: Record<string, string>;
  message?: string;
};

function maybeBlurActiveElement() {
  // HACK: blur the current element to ensure we show the error
  if (document.activeElement && "blur" in document.activeElement) {
    (document.activeElement as HTMLInputElement).blur();
  }
}

function getGeneralErrorMessage(error: ServerErrorResponse) {
  if (typeof error.data === "object") {
    if (error.data.message) {
      return error.data.message;
    }
    if (error.data?.errors?._error) {
      return error.data.errors._error;
    }
  }
  if (error.message) {
    return error.message;
  }
  if (typeof error.data === "string") {
    return error.data;
  }
}

function Form({
  form,
  fields,
  initialValues: initialValuesProp = {},
  overwriteOnInitialValuesChange = false,
  validate,
  initial,
  normalize,
  onSubmit,
  onSubmitSuccess,
  ...props
}: FormContainerProps) {
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState({});

  const { inlineFields, registerFormField, unregisterFormField } =
    useInlineFields();

  const formDefinition = useMemo(() => {
    const formDef = form || {
      fields: fields || Object.values(inlineFields),
      validate,
      initial,
      normalize,
    };
    return {
      ...formDef,
      fields: (values: FieldValues) => {
        const fieldList =
          typeof formDef.fields === "function"
            ? (formDef.fields(values) as BaseFieldDefinition[])
            : (formDef.fields as BaseFieldDefinition[]);
        return fieldList.map(fieldDef => ({
          ...fieldDef,
          ...inlineFields[fieldDef.name],
        }));
      },
    };
  }, [form, fields, inlineFields, validate, initial, normalize]);

  const formObject = useMemo(
    () => makeFormObject(formDefinition),
    [formDefinition],
  );

  const initialValues = useMemo(() => {
    const fieldNames = formObject.fieldNames(values);

    const filteredInitialValues: FieldValues = {};
    Object.keys(initialValuesProp || {}).forEach(fieldName => {
      if (fieldNames.includes(fieldName)) {
        filteredInitialValues[fieldName] = initialValuesProp[fieldName];
      }
    });

    return merge(formObject.initial(values), filteredInitialValues);
  }, [values, initialValuesProp, formObject]);

  const fieldNames = useMemo(
    () => formObject.fieldNames({ ...initialValues, ...values }),
    [formObject, values, initialValues],
  );

  const handleValidation = useCallback(
    (values: FieldValues) => {
      const result = formObject.validate(values, { values });

      // Ensure errors don't have empty strings
      // as they will also be treated as errors
      return cleanObject(result);
    },
    [formObject],
  );

  const handleError = useCallback(
    (error: ServerErrorResponse, formikHelpers: FormikHelpers<FieldValues>) => {
      maybeBlurActiveElement();
      const DEFAULT_ERROR_MESSAGE = t`An error occurred`;

      if (typeof error?.data === "object" && error?.data?.errors) {
        const errorNames = Object.keys(error.data.errors);
        const hasUnknownFields = errorNames.some(
          name => !fieldNames.includes(name),
        );

        if (hasUnknownFields) {
          const generalMessage =
            getGeneralErrorMessage(error) || DEFAULT_ERROR_MESSAGE;
          setError(generalMessage);
        }

        formikHelpers.setErrors(error.data.errors);
        return error.data.errors;
      }

      if (error) {
        const message = getGeneralErrorMessage(error) || DEFAULT_ERROR_MESSAGE;
        setError(message);
        return message;
      }

      return DEFAULT_ERROR_MESSAGE;
    },
    [fieldNames],
  );

  const handleSubmit = useCallback(
    async (values: FieldValues, formikHelpers: FormikHelpers<FieldValues>) => {
      try {
        const normalized = formObject.normalize(values);
        const result = await onSubmit(normalized);
        onSubmitSuccess?.(result);
        return result;
      } catch (e) {
        const error = handleError(e as ServerErrorResponse, formikHelpers);
        // Need to throw, so e.g. submit button can react to an error
        throw error;
      }
    },
    [formObject, onSubmit, onSubmitSuccess, handleError],
  );

  return (
    <Formik
      validateOnBlur
      validateOnMount
      initialValues={initialValues}
      enableReinitialize={overwriteOnInitialValuesChange}
      validate={handleValidation}
      onSubmit={handleSubmit}
    >
      {(formikProps: FormikProps<FieldValues>) => (
        <FormikFormViewAdapter
          {...formikProps}
          {...props}
          formObject={formObject}
          error={error}
          registerFormField={registerFormField}
          unregisterFormField={unregisterFormField}
          onValuesChange={setValues}
        />
      )}
    </Formik>
  );
}

export {
  CustomFormField as FormField,
  CustomFormSubmit as FormSubmit,
  CustomFormMessage as FormMessage,
  CustomFormFooter as FormFooter,
  CustomFormSection as FormSection,
} from "metabase/components/form/FormikCustomForm";

export default Form;
