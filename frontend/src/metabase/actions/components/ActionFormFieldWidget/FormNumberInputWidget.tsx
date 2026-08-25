import type { ReactNode, Ref } from "react";
import { forwardRef } from "react";

import type { ActionFormFieldProps } from "metabase/actions/types";
import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import { FormField, FormNumberInput } from "metabase/forms";

type FormNumberInputWidgetProps = ActionFormFieldProps & {
  actions?: ReactNode;
  disabled?: boolean;
  nullable?: boolean;
};

export const FormNumberInputWidget = forwardRef(function FormNumberInputWidget(
  {
    name,
    title,
    description,
    actions,
    optional,
    nullable,
    disabled,
    placeholder,
  }: FormNumberInputWidgetProps,
  ref: Ref<HTMLInputElement>,
) {
  const id = useUniqueId();

  return (
    <FormField
      title={title}
      actions={actions}
      description={description}
      optional={optional}
      htmlFor={id}
    >
      <FormNumberInput
        ref={ref}
        id={id}
        name={name}
        nullable={nullable}
        disabled={disabled}
        placeholder={placeholder}
        size="sm"
      />
    </FormField>
  );
});
