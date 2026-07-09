import type { ReactNode, Ref } from "react";
import { forwardRef } from "react";

import type { ActionFormFieldProps } from "metabase/actions/types";
import { FormTextarea } from "metabase/forms";

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
  return (
    <FormTextarea
      {...props}
      ref={ref}
      name={name}
      label={title}
      nullable={nullable}
      minRows={5}
    />
  );
});
