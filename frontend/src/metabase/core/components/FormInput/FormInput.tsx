import React, {
  ChangeEvent,
  forwardRef,
  ReactNode,
  Ref,
  useCallback,
} from "react";
import { useField } from "formik";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import Input, { InputProps } from "metabase/core/components/Input";
import FormField from "metabase/core/components/FormField";

export interface FormInputProps
  extends Omit<
    InputProps,
    "value" | "error" | "fullWidth" | "onChange" | "onBlur"
  > {
  name: string;
  nullable?: boolean;
  title?: string;
  description?: ReactNode;
  infoTooltip?: string;
}

const FormInput = forwardRef(function FormInput(
  {
    name,
    nullable,
    className,
    style,
    title,
    description,
    infoTooltip,
    ...props
  }: FormInputProps,
  ref: Ref<HTMLDivElement>,
) {
  const id = useUniqueId();
  const [{ value, onBlur }, { error, touched }, { setValue }] = useField(name);

  const handleChange = useCallback(
    ({ target: { value } }: ChangeEvent<HTMLInputElement>) => {
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
      description={description}
      infoTooltip={infoTooltip}
      htmlFor={id}
      error={touched ? error : undefined}
    >
      <Input
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

export default FormInput;
