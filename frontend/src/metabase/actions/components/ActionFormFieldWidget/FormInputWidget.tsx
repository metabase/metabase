import type { ReactNode, Ref } from "react";
import { forwardRef } from "react";
import { match } from "ts-pattern";

import type { ActionFormFieldProps } from "metabase/actions/types";
import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import { FormField, FormTextInput } from "metabase/forms";

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
        type={match(type)
          .with("date", () => "date")
          .with("time", () => "time")
          .with("datetime-local", () => "datetime-local")
          .otherwise(() => "text")}
        placeholder={placeholder}
        nullable={nullable}
        disabled={disabled}
      />
    </FormField>
  );
});
