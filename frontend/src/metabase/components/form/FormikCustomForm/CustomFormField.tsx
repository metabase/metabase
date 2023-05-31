import { forwardRef, useCallback, useMemo } from "react";
import _ from "underscore";

import { useMount, useUnmount } from "react-use";
import { isCustomWidget } from "metabase-types/guards";
import FormField from "metabase/components/form/FormikFormField";
import FormWidget from "metabase/components/form/FormWidget";

import {
  BaseFieldDefinition,
  StandardFormFieldDefinition,
  FormFieldDefinition,
} from "metabase-types/forms";

import { useForm } from "./context";

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

/**
 * @deprecated
 */
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

  const field = fields[name];
  const formField = formFieldsByName[name];

  useMount(() => {
    registerFormField?.(
      getFieldDefinition(props as StandardFormFieldDefinition),
    );
  });

  useUnmount(() => {
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

/**
 * @deprecated
 */
const CustomFormField = forwardRef<
  HTMLInputElement,
  CustomFormFieldProps
>(function CustomFormField(props, ref) {
  return <RawCustomFormField {...props} forwardedRef={ref} />;
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CustomFormField;
