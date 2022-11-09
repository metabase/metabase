import React, { forwardRef, ReactNode, Ref } from "react";
import { useField } from "formik";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import TextArea, { TextAreaProps } from "metabase/core/components/TextArea";
import FormField from "metabase/core/components/FormField";

export interface FormTextAreaProps
  extends Omit<TextAreaProps, "value" | "error" | "onChange" | "onBlur"> {
  name: string;
  title?: string;
  description?: ReactNode;
  infoLabel?: string;
  infoTooltip?: string;
}

const FormTextArea = forwardRef(function FormTextArea(
  {
    name,
    className,
    style,
    title,
    description,
    infoLabel,
    infoTooltip,
    ...props
  }: FormTextAreaProps,
  ref: Ref<HTMLDivElement>,
) {
  const id = useUniqueId();
  const [{ value, onChange, onBlur }, { error, touched }] = useField(name);

  return (
    <FormField
      ref={ref}
      className={className}
      style={style}
      title={title}
      description={description}
      htmlFor={id}
      error={touched ? error : undefined}
      infoLabel={infoLabel}
      infoTooltip={infoTooltip}
    >
      <TextArea
        {...props}
        id={id}
        name={name}
        value={value}
        error={touched && error != null}
        onChange={onChange}
        onBlur={onBlur}
      />
    </FormField>
  );
});

export default FormTextArea;
