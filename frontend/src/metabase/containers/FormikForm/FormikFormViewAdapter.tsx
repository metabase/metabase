import React, { useEffect, useState } from "react";
import _ from "underscore";
import { getIn } from "icepick";

// eslint-disable-next-line import/named
import { FormikProps } from "formik";

import { CustomFormProps } from "metabase/components/form/CustomForm";

import { usePrevious } from "metabase/hooks/use-previous";

import { FieldName, FieldValues, FormField } from "metabase-types/forms";

import FormView from "./FormView";

type FormProps = Omit<
  CustomFormProps,
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

function getMaybeNestedValue<Value = string>(
  obj: Record<string, Value>,
  fieldName: string,
): Value {
  const isNestedField = fieldName.includes(".");
  return isNestedField ? getIn(obj, fieldName.split(".")) : obj[fieldName];
}

interface FormikFormViewAdapterOwnProps {
  formInitialValues: FieldValues;
  onValuesChange: (values: FieldValues) => void;
}

type FormikFormViewAdapterProps = FormikProps<FieldValues> &
  FormProps &
  FormikFormViewAdapterOwnProps;

function FormikFormViewAdapter({
  formObject,
  formInitialValues,
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
  ...rest
}: FormikFormViewAdapterProps) {
  const [active, setActive] = useState<string | null>(null);
  const previousValues = usePrevious(values);

  useEffect(() => {
    if (!_.isEqual(previousValues, values)) {
      onValuesChange(values);
    }
  }, [previousValues, values, onValuesChange]);

  useEffect(() => {
    if (!_.isEqual(formInitialValues, initialValues)) {
      resetForm({ values: formInitialValues });
    }
  }, [formInitialValues, initialValues, resetForm]);

  const fields = formObject.fields(values);
  const formFieldsByName = _.indexBy(fields, "name");

  const smartFields: FormField[] = fields.map(field => {
    const { name } = field;

    const value = getMaybeNestedValue(values, name);
    const initialValue = getMaybeNestedValue(initialValues, name);
    const error = getMaybeNestedValue(errors, name);
    const isTouched = getMaybeNestedValue(touched, name);

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

  return (
    <FormView
      {...rest}
      fields={_.indexBy(smartFields, "name")}
      formFields={fields}
      formFieldsByName={formFieldsByName}
      formObject={formObject}
      dirty={dirty}
      errors={errors as Record<FieldName, string>}
      invalid={!isValid}
      valid={isValid}
      pristine={!dirty}
      disablePristineSubmit={formObject.disablePristineSubmit}
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

export default FormikFormViewAdapter;
