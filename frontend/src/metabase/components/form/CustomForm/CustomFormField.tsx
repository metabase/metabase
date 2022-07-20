import React, { useCallback, useMemo } from "react";
import PropTypes from "prop-types";
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

import {
  CustomFormLegacyContext,
  FormContainerLegacyContext,
  LegacyContextTypes,
} from "./types";

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

interface LegacyContextProps
  extends CustomFormLegacyContext,
    FormContainerLegacyContext {}

function getFieldDefinition(props: CustomFormFieldProps): BaseFieldDefinition {
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

function RawCustomFormField({
  fields,
  formFieldsByName,
  values,
  onChangeField,
  registerFormField,
  unregisterFormField,
  ...props
}: CustomFormFieldProps & LegacyContextProps & { forwardedRef?: any }) {
  const { name, onChange, forwardedRef } = props;

  const field = getIn(fields, name.split("."));
  const formField = formFieldsByName[name];

  useOnMount(() => {
    registerFormField?.(getFieldDefinition(props));
  });

  useOnUnmount(() => {
    unregisterFormField?.(getFieldDefinition(props));
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

const CustomFormFieldLegacyContext = (
  props: CustomFormFieldProps & { forwardedRef?: any },
  context: LegacyContextProps,
) => <RawCustomFormField {...props} {...context} />;

CustomFormFieldLegacyContext.contextTypes = {
  ..._.pick(
    LegacyContextTypes,
    "fields",
    "formFieldsByName",
    "values",
    "onChangeField",
  ),
  registerFormField: PropTypes.func,
  unregisterFormField: PropTypes.func,
};

export default React.forwardRef<HTMLInputElement, CustomFormFieldProps>(
  function CustomFormField(props, ref) {
    return <CustomFormFieldLegacyContext {...props} forwardedRef={ref} />;
  },
);
