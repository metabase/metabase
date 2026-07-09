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
    options,
    type,
    field,
    nullable,
    ...props
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
        {...props}
        ref={ref}
        id={id}
        name={name}
        nullable={nullable}
        size="sm"
      />
    </FormField>
  );
});
