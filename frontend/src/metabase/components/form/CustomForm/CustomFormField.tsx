import React, { useCallback, useMemo } from "react";
import { getIn } from "icepick";
import _ from "underscore";

import FormField from "metabase/components/form/FormField";
import FormWidget from "metabase/components/form/FormWidget";

import { useOnMount } from "metabase/hooks/use-on-mount";
import { useOnUnmount } from "metabase/hooks/use-on-unmount";

import {
  BaseFieldDefinition,
  StandardFormFieldDefinition,
  CustomFormFieldDefinition,
  FormFieldDefinition,
} from "metabase-types/forms";

import { useForm } from "./context";

function isCustomWidget(
  formField: FormFieldDefinition,
): formField is CustomFormFieldDefinition {
  return (
    !(formField as StandardFormFieldDefinition).type &&
    typeof (formField as CustomFormFieldDefinition).widget === "function"
  );
}

export interface CustomFormFieldProps extends BaseFieldDefinition {
  onChange?: (e: unknown) => void;
}

function getFieldDefinition(
  props: StandardFormFieldDefinition,
): FormFieldDefinition {
  return _.pick(
    props,
    "name",
    "type",
    "title",
    "description",
    "initial",
    "validate",
    "normalize",
  );
}

function RawCustomFormField(
  props: CustomFormFieldProps & { forwardedRef?: any },
) {
  const { name, onChange, forwardedRef } = props;
  const {
    fields,
    formFieldsByName,
    values,
    onChangeField,
    registerFormField,
    unregisterFormField,
  } = useForm();

  const field = getIn(fields, name.split("."));
  const formField = formFieldsByName[name];

  useOnMount(() => {
    registerFormField?.(
      getFieldDefinition(props as StandardFormFieldDefinition),
    );
  });

  useOnUnmount(() => {
    unregisterFormField?.(
      getFieldDefinition(props as StandardFormFieldDefinition),
    );
  });

  const handleChange = useCallback(
    e => {
      field.onChange(e);
      onChange?.(e);
    },
    [field, onChange],
  );

  const fieldProps = useMemo(
    () => ({
      ...props,
      values,
      onChangeField,
      formField,
      field:
        typeof onChange === "function"
          ? {
              ...field,
              onChange: handleChange,
            }
          : field,
    }),
    [props, values, formField, field, onChange, onChangeField, handleChange],
  );

  if (!field || !formField) {
    return null;
  }

  const hasCustomWidget = isCustomWidget(formField);
  const Widget = hasCustomWidget ? formField.widget : FormWidget;

  return (
    <FormField {...fieldProps}>
      <Widget {...fieldProps} ref={forwardedRef} />
    </FormField>
  );
}

export default React.forwardRef<HTMLInputElement, CustomFormFieldProps>(
  function CustomFormField(props, ref) {
    return <RawCustomFormField {...props} forwardedRef={ref} />;
  },
);
