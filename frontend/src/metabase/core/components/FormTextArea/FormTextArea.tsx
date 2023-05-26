import React, {
  ChangeEvent,
  forwardRef,
  ReactNode,
  Ref,
  useCallback,
} from "react";
import { useField } from "formik";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import TextArea, { TextAreaProps } from "metabase/core/components/TextArea";
import FormField from "metabase/core/components/FormField";

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
