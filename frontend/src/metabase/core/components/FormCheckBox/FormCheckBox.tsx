import { forwardRef, ReactNode, Ref } from "react";
import { useField } from "formik";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import CheckBox, { CheckBoxProps } from "metabase/core/components/CheckBox";
import FormField from "metabase/core/components/FormField";

export interface FormCheckBoxProps
  extends Omit<CheckBoxProps, "checked" | "onChange" | "onBlur"> {
  name: string;
  title?: string;
  description?: ReactNode;
  optional?: boolean;
}

const FormCheckBox = forwardRef(function FormCheckBox(
  {
    name,
    className,
    style,
    title,
    description,
    optional,
    ...props
  }: FormCheckBoxProps,
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
      alignment="start"
      orientation="horizontal"
      htmlFor={id}
      error={touched ? error : undefined}
      optional={optional}
    >
      <CheckBox
        {...props}
        id={id}
        name={name}
        checked={value ?? false}
        onChange={onChange}
        onBlur={onBlur}
      />
    </FormField>
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FormCheckBox;
