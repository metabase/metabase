import type { ReactNode, Ref } from "react";
import { forwardRef } from "react";

import type { ActionFormFieldProps } from "metabase/actions/types";
import { FormField } from "metabase/common/components/FormField";
import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import { FormSelect } from "metabase/forms/components/FormSelect";

type FormSelectWidgetProps = ActionFormFieldProps & {
  actions?: ReactNode;
  disabled?: boolean;
  nullable?: boolean;
};

export const FormSelectWidget = forwardRef(function FormSelectWidget(
  {
    title,
    description,
    actions,
    optional,
    options = [],
    type,
    field,
    ...props
  }: FormSelectWidgetProps,
  ref: Ref<HTMLInputElement>,
) {
  const id = useUniqueId();
  const data = options.map((option) => ({
    value: String(option.value),
    label: String(option.name),
  }));

  return (
    <FormField
      title={title}
      actions={actions}
      description={description}
      htmlFor={id}
      optional={optional}
    >
      <FormSelect ref={ref} id={id} size="sm" data={data} {...props} />
    </FormField>
  );
});
