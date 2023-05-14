import React, { useEffect, useState } from "react";
import _ from "underscore";
import { usePrevious } from "react-use";

// eslint-disable-next-line import/named
import { FormikProps } from "formik";

import { CustomFormProps } from "metabase/components/form/FormikCustomForm";

import { BaseFieldValues, FormField } from "metabase-types/forms";

import { getMaybeNestedValue } from "../formUtils";
import FormView from "./FormView";

type FormProps<Values extends BaseFieldValues> = Omit<
  CustomFormProps<Values>,
  | "fields"
  | "errors"
  | "formFields"
  | "formFieldsByName"
  | "invalid"
  | "valid"
  | "pristine"
  | "submitting"
  | "asyncValidate"
  | "asyncValidating"
  | "initializeForm"
  | "destroyForm"
  | "onSubmitSuccess"
  | "resetForm"
  | "handleSubmit"
  | "onChangeField"
  | "submitFailed"
>;

interface FormikFormViewAdapterOwnProps<Values> {
  onValuesChange: (values: Values) => void;
}

type FormikFormViewAdapterProps<Values> = FormikProps<Values> &
  FormProps<Values> &
  FormikFormViewAdapterOwnProps<Values>;

function FormikFormViewAdapter<Values extends BaseFieldValues>({
  formObject,
  onValuesChange,

  errors,
  dirty,
  isValid,
  values,
  touched,
  isValidating,
  isSubmitting,
  validateForm,
  handleSubmit,
  setFieldValue,
  setFieldTouched,
  resetForm,
  initialValues,
  submitForm,
  disablePristineSubmit = formObject.disablePristineSubmit,
  ...rest
}: FormikFormViewAdapterProps<Values>) {
  const [active, setActive] = useState<string | null>(null);
  const previousValues = usePrevious(values);

  useEffect(() => {
    if (!_.isEqual(previousValues, values)) {
      onValuesChange(values);
    }
  }, [previousValues, values, onValuesChange]);

  const fields = formObject.fields(values);
  const formFieldsByName = _.indexBy(fields, "name");

  const smartFields = fields.map(field => {
    const { name } = field;

    const value = getMaybeNestedValue(values, name);
    const initialValue = getMaybeNestedValue(initialValues, name);
    const error = getMaybeNestedValue(errors as Record<string, string>, name);
    const isTouched = !!getMaybeNestedValue(
      touched as Record<string, boolean>,
      name,
    );

    return {
      ...field,
      dirty: value !== initialValue,
      error,
      initialValue: initialValues[name],
      invalid: !!error,
      pristine: !isTouched,
      touched: isTouched,
      valid: !error,
      value: value,
      visited: isTouched,
      active: active === name,
      onFocus: () => setActive(name),
      onBlur: () => setActive(null),
      onChange: (e: React.ChangeEvent | unknown) => {
        const isEvent = _.isObject(e) && "target" in e;
        setFieldValue(field.name, isEvent ? e.target.value : e);
        setFieldTouched(field.name, true, false);
      },
    };
  });

  const smartFieldsByName = _.indexBy(smartFields, "name");

  return (
    <FormView<Values>
      {...rest}
      fields={
        smartFieldsByName as unknown as Record<keyof Values, FormField<Values>>
      }
      formFields={fields}
      formFieldsByName={formFieldsByName}
      formObject={formObject}
      dirty={dirty}
      errors={errors as Record<keyof Values, string>}
      invalid={!isValid}
      valid={isValid}
      pristine={!dirty}
      disablePristineSubmit={disablePristineSubmit}
      values={values}
      submitting={isSubmitting}
      asyncValidate={validateForm}
      asyncValidating={isValidating}
      initializeForm={_.noop}
      destroyForm={_.noop}
      onSubmitSuccess={_.noop}
      resetForm={resetForm}
      handleSubmit={submitForm}
      onChangeField={setFieldValue}
      submitFailed={false}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FormikFormViewAdapter;
