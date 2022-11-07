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
}

const FormTextArea = forwardRef(function FormTextArea(
  { name, className, style, title, description, ...props }: FormTextAreaProps,
  ref: Ref<HTMLDivElement>,
) {
  const id = useUniqueId();
  const [field, meta] = useField(name);

  return (
    <FormField
      ref={ref}
      className={className}
      style={style}
      title={title}
      description={description}
      htmlFor={id}
      error={meta.touched ? meta.error : undefined}
    >
      <TextArea
        {...props}
        id={id}
        name={name}
        value={field.value}
        error={meta.touched && meta.error != null}
        onChange={field.onChange}
        onBlur={field.onBlur}
      />
    </FormField>
  );
});

export default FormTextArea;
