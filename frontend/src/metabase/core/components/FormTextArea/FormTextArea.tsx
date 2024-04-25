import { useField } from "formik";
import type { ChangeEvent, ReactNode, Ref } from "react";
import { forwardRef, useCallback } from "react";

import FormField from "metabase/core/components/FormField";
import type { TextAreaProps } from "metabase/core/components/TextArea";
import TextArea from "metabase/core/components/TextArea";
import { useUniqueId } from "metabase/hooks/use-unique-id";

export interface FormTextAreaProps
  extends Omit<
    TextAreaProps,
    "value" | "error" | "fullWidth" | "onChange" | "onBlur"
  > {
  name: string;
  title?: string;
  actions?: ReactNode;
  description?: ReactNode;
  nullable?: boolean;
  infoLabel?: string;
  infoTooltip?: string;
  optional?: boolean;
}

const FormTextArea = forwardRef(function FormTextArea(
  {
    name,
    className,
    style,
    title,
    actions,
    description,
    nullable,
    infoLabel,
    infoTooltip,
    optional,
    ...props
  }: FormTextAreaProps,
  ref: Ref<HTMLDivElement>,
) {
  const id = useUniqueId();
  const [{ value, onBlur }, { error, touched }, { setValue }] = useField(name);

  const handleChange = useCallback(
    ({ target: { value } }: ChangeEvent<HTMLTextAreaElement>) => {
      setValue(value === "" && nullable ? null : value);
    },
    [nullable, setValue],
  );

  return (
    <FormField
      ref={ref}
      className={className}
      style={style}
      title={title}
      actions={actions}
      description={description}
      htmlFor={id}
      error={touched ? error : undefined}
      infoLabel={infoLabel}
      infoTooltip={infoTooltip}
      optional={optional}
    >
      <TextArea
        {...props}
        id={id}
        name={name}
        value={value ?? ""}
        error={touched && error != null}
        fullWidth
        onChange={handleChange}
        onBlur={onBlur}
      />
    </FormField>
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(FormTextArea, {
  Root: TextArea.Root,
});
