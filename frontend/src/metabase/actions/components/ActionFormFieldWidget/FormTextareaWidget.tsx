import type { ReactNode, Ref } from "react";
import { forwardRef } from "react";

import type { ActionFormFieldProps } from "metabase/actions/types";
import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import { FormField, FormTextarea } from "metabase/forms";

type FormTextareaWidgetProps = ActionFormFieldProps & {
  actions?: ReactNode;
  disabled?: boolean;
  nullable?: boolean;
};

export const FormTextareaWidget = forwardRef(function FormTextareaWidget(
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
  }: FormTextareaWidgetProps,
  ref: Ref<HTMLTextAreaElement>,
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
      <FormTextarea
        {...props}
        ref={ref}
        id={id}
        name={name}
        nullable={nullable}
        minRows={5}
      />
    </FormField>
  );
});
