import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";
import { Formik } from "formik";

import CustomForm, {
  CustomFormProps,
} from "metabase/components/form/CustomForm";
import StandardForm from "metabase/components/form/StandardForm";

import {
  FormFieldDefinition,
  FormObject,
  FieldValues,
} from "metabase-types/forms";

import withFormikAdapter from "./FormikAdapter";
import { makeFormObject } from "./utils";

function FormView(
  props: CustomFormProps & {
    formComponent?: React.ComponentType<CustomFormProps>;
  },
) {
  const FormComponent =
    props.formComponent || (props.children ? CustomForm : StandardForm);

  return <FormComponent {...props} />;
}

const AdaptedFormView = withFormikAdapter(FormView);

interface FormContainerProps {
  form?: FormObject;

  fields?: FormFieldDefinition[];
  values?: FieldValues;
  initialValues?: FieldValues;

  overwriteOnInitialValuesChange?: boolean;

  validate?: () => void;
  initial?: () => void;
  normalize?: () => void;

  onSubmit: (values: FieldValues) => Promise<void>;
  onSubmitSuccess: (action: unknown) => void;
}

type ServerErrorResponse = {
  data?: {
    message?: string;
    errors?: Record<string, string>;
  };
  message?: string;
};

function maybeBlurActiveElement() {
  // HACK: blur the current element to ensure we show the error
  if (document.activeElement && "blur" in document.activeElement) {
    (document.activeElement as HTMLInputElement).blur();
  }
}

function Form({
  form,
  fields,
  values = {},
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
    return formDef;
  }, [form, fields, validate, initial, normalize]);

  const formObject = useMemo(() => makeFormObject(formDefinition), [
    formDefinition,
  ]);

  const initialValues = useMemo(() => formObject.initial(values), [
    values,
    formObject,
  ]);

  const fieldNames = useMemo(
    () => formObject.fieldNames({ ...initialValues, ...values }),
    [formObject, values, initialValues],
  );

  const handleValidation = useCallback(
    (values: FieldValues) => {
      formObject.validate(values);
    },
    [formObject],
  );

  const handleSubmit = useCallback(
    async (values: FieldValues) => {
      try {
        const normalized = formObject.normalize(values);
        const result = await onSubmit(normalized);
        onSubmitSuccess?.(result);
        return result;
      } catch (e) {
        const error = e as ServerErrorResponse;
        if (error?.data?.errors) {
          maybeBlurActiveElement();
          const errorNames = Object.keys(error.data.errors);
          const hasUnknownFields = errorNames.some(
            name => !fieldNames.include(name),
          );
          throw {
            _error: hasUnknownFields ? t`An error occurred` : null,
            ...error.data.errors,
          };
        }
        if (error) {
          throw {
            _error:
              error.data?.message ||
              error.message ||
              error.data ||
              t`An error occurred`,
          };
        }
      }
    },
    [formObject, fieldNames, onSubmit, onSubmitSuccess],
  );

  return (
    <Formik
      enableReinitialize={overwriteOnInitialValuesChange}
      initialValues={initialValues}
      validate={handleValidation}
      onSubmit={handleSubmit}
    >
      {formikProps => (
        <AdaptedFormView {...formikProps} {...props} formObject={formObject} />
      )}
    </Formik>
  );
}

export default Form;
