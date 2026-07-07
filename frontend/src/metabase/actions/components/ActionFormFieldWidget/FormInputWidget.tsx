import { useField } from "formik";
import type {
  ChangeEvent,
  HTMLInputTypeAttribute,
  ReactNode,
  Ref,
} from "react";
import { forwardRef, useCallback } from "react";

import type { ActionFormFieldProps } from "metabase/actions/types";
import { FormField } from "metabase/common/components/FormField";
import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import { TextInput } from "metabase/ui";
import type { InputComponentType } from "metabase-types/api";

const HTML_INPUT_TYPES: Partial<
  Record<InputComponentType, HTMLInputTypeAttribute>
> = {
  text: "text",
  date: "date",
  time: "time",
  "datetime-local": "datetime-local",
};

type FormInputWidgetProps = ActionFormFieldProps & {
  actions?: ReactNode;
  disabled?: boolean;
  nullable?: boolean;
};

export const FormInputWidget = forwardRef(function FormInputWidget(
  {
    name,
    title,
    description,
    placeholder,
    type,
    optional,
    actions,
    disabled,
    nullable,
  }: FormInputWidgetProps,
  ref: Ref<HTMLInputElement>,
) {
  const id = useUniqueId();
  const [{ value, onBlur }, { error, touched }, { setValue }] = useField(name);
  const hasError = touched && error != null;

  const handleChange = useCallback(
    ({ target: { value } }: ChangeEvent<HTMLInputElement>) => {
      setValue(value === "" && nullable ? null : value);
    },
    [nullable, setValue],
  );

  return (
    <FormField
      title={title}
      description={description}
      actions={actions}
      optional={optional}
      htmlFor={id}
      error={touched ? error : undefined}
    >
      <TextInput
        ref={ref}
        id={id}
        name={name}
        type={HTML_INPUT_TYPES[type] ?? "text"}
        placeholder={placeholder}
        value={value ?? ""}
        error={hasError}
        disabled={disabled}
        onChange={handleChange}
        onBlur={onBlur}
      />
    </FormField>
  );
});
