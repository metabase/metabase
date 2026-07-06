import { useField } from "formik";
import type { ChangeEvent, ReactNode, Ref } from "react";
import { forwardRef, useCallback } from "react";

import type { ActionFormFieldProps } from "metabase/actions/types";
import { FormField } from "metabase/common/components/FormField";
import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import { Textarea } from "metabase/ui";

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
  const [{ value }, { error, touched }, { setValue, setTouched }] =
    useField(name);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = event.target.value;
      if (newValue === "") {
        setValue(nullable ? null : undefined);
      } else {
        setValue(newValue);
      }
    },
    [nullable, setValue],
  );

  const handleBlur = useCallback(() => {
    setTouched(true);
  }, [setTouched]);

  return (
    <FormField
      title={title}
      actions={actions}
      description={description}
      htmlFor={id}
      error={touched ? error : undefined}
      optional={optional}
    >
      <Textarea
        {...props}
        ref={ref}
        id={id}
        name={name}
        value={value ?? ""}
        error={touched && Boolean(error)}
        minRows={5}
        onChange={handleChange}
        onBlur={handleBlur}
      />
    </FormField>
  );
});
