import type { ReactNode, Ref } from "react";
import { forwardRef } from "react";

import type { ActionFormFieldProps } from "metabase/actions/types";
import { FormField } from "metabase/common/components/FormField";
import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import { FormNumberInput } from "metabase/forms";

type FormNumberInputWidgetProps = ActionFormFieldProps & {
  actions?: ReactNode;
  disabled?: boolean;
  nullable?: boolean;
};

export const FormNumberInputWidget = forwardRef(function FormNumberInputWidget(
  {
    title,
    description,
    actions,
    optional,
    options,
    type,
    field,
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
      htmlFor={id}
      optional={optional}
    >
      <FormNumberInput ref={ref} id={id} size="sm" {...props} />
    </FormField>
  );
});
