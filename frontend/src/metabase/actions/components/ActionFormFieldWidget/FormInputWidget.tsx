import type { HTMLInputTypeAttribute, ReactNode, Ref } from "react";
import { forwardRef } from "react";

import type { ActionFormFieldProps } from "metabase/actions/types";
import { FormField } from "metabase/common/components/FormField";
import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import { FormTextInput } from "metabase/forms";
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

  return (
    <FormField
      title={title}
      description={description}
      actions={actions}
      optional={optional}
      htmlFor={id}
    >
      <FormTextInput
        ref={ref}
        id={id}
        name={name}
        type={HTML_INPUT_TYPES[type] ?? "text"}
        placeholder={placeholder}
        nullable={nullable}
        disabled={disabled}
      />
    </FormField>
  );
});
