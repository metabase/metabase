import React, { useState } from "react";
import _ from "underscore";

// eslint-disable-next-line import/named
import { FormikProps } from "formik";

import { CustomFormProps } from "metabase/components/form/CustomForm";

import {
  FieldName,
  FieldValues,
  FormField,
  FormObject,
} from "metabase-types/forms";

function withFormikAdapter(Component: React.ComponentType<CustomFormProps>) {
  function FormWithFormikAdapter({
    formObject,
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
    resetForm,
    initialValues,
    submitForm,
    ...rest
  }: FormikProps<FieldValues> & {
    formObject: FormObject;
  }) {
    const [active, setActive] = useState<string | null>(null);

    const fields = formObject.fields(values);
    const formFieldsByName = _.indexBy(fields, "name");

    const smartFields: FormField[] = fields.map(field => {
      const { name } = field;
      return {
        ...field,
        dirty: values[name] !== initialValues[name],
        error: errors[name],
        initialValue: initialValues[name],
        invalid: !!errors[name],
        pristine: !touched[name],
        touched: !!touched[name],
        valid: !errors[name],
        value: values[name],
        visited: !!touched[name],
        active: active === name,
        onFocus: () => setActive(name),
        onBlur: () => setActive(null),
        onChange: (e: React.ChangeEvent | unknown) => {
          const isEvent = _.isObject(e) && "target" in e;
          setFieldValue(field.name, isEvent ? e.target.value : e);
        },
      };
    });

    return (
      <Component
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

  return FormWithFormikAdapter;
}

export default withFormikAdapter;
