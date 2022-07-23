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
import { makeFormObject } from "../formUtils";

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
  const formDefinition = useMemo(() => {
    const formDef = form || {
      fields,
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
        return fieldList;
      },
    };
  }, [form, fields, validate, initial, normalize]);

  const formObject = useMemo(
    () => makeFormObject(formDefinition),
    [formDefinition],
  );

  const initialValues = useMemo(() => {
    const fieldNames = formObject.fieldNames();

    const filteredInitialValues: FieldValues = {};
    Object.keys(initialValuesProp || {}).forEach(fieldName => {
      if (fieldNames.includes(fieldName)) {
        filteredInitialValues[fieldName] = initialValuesProp[fieldName];
      }
    });

    return merge(formObject.initial(), filteredInitialValues);
  }, [initialValuesProp, formObject]);

  const handleValidation = useCallback(
    (values: FieldValues) => formObject.validate(values, { values }),
    [formObject],
  );

  const handleError = useCallback(
    (error: ServerErrorResponse, formikHelpers: FormikHelpers<FieldValues>) => {
      maybeBlurActiveElement();
      const DEFAULT_ERROR_MESSAGE = t`An error occurred`;

      if (typeof error?.data === "object" && error?.data?.errors) {
        formikHelpers.setErrors(error.data.errors);
        return error.data.errors;
      }

      if (error) {
        return getGeneralErrorMessage(error) || DEFAULT_ERROR_MESSAGE;
      }

      return DEFAULT_ERROR_MESSAGE;
    },
    [],
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
          registerFormField={_.noop}
          unregisterFormField={_.noop}
        />
      )}
    </Formik>
  );
}

export default Form;
