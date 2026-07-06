import type { ReactNode, Ref } from "react";
import { forwardRef } from "react";

import type { ActionFormFieldProps } from "metabase/actions/types";
import { FormField } from "metabase/common/components/FormField";
import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import { FormTextarea } from "metabase/forms/components/FormTextarea";

type FormTextareaWidgetProps = ActionFormFieldProps & {
  actions?: ReactNode;
  disabled?: boolean;
  nullable?: boolean;
};

export const FormTextareaWidget = forwardRef(function FormTextareaWidget(
  {
    title,
    description,
    actions,
    optional,
    options,
    type,
    field,
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
      htmlFor={id}
      optional={optional}
    >
      <FormTextarea ref={ref} id={id} minRows={5} {...props} />
    </FormField>
  );
});
