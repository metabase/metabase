import { useField } from "formik";
import type { ChangeEvent, ReactNode, Ref } from "react";
import { forwardRef, useCallback } from "react";

import { FormField } from "metabase/common/components/FormField";
import type { TextAreaProps } from "metabase/common/components/TextArea";
import { TextArea } from "metabase/common/components/TextArea";
import { useUniqueId } from "metabase/common/hooks/use-unique-id";

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
  inputClassName?: string;
}

/**
 * @deprecated: use FormTextArea from "metabase/forms"
 */
const FormTextAreaInner = forwardRef(function FormTextArea(
  {
    name,
    className,
    inputClassName,
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
        className={inputClassName}
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

export const FormTextArea = Object.assign(FormTextAreaInner, {
  Root: TextArea.Root,
});
