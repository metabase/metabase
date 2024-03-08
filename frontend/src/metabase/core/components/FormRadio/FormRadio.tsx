import { useField } from "formik";
import type { Key, ReactNode, Ref } from "react";
import { forwardRef } from "react";

import FormField from "metabase/core/components/FormField";
import type { RadioOption, RadioProps } from "metabase/core/components/Radio";
import Radio from "metabase/core/components/Radio";

export interface FormRadioProps<
  TValue extends Key = string,
  TOption = RadioOption<TValue>,
> extends Omit<
    RadioProps<TValue, TOption>,
    "value" | "error" | "onChange" | "onBlur"
  > {
  name: string;
  title?: string;
  actions?: ReactNode;
  description?: ReactNode;
  optional?: boolean;
}

/**
 * @deprecated: use FormRadioGroup from "metabase/ui"
 */
const FormRadio = forwardRef(function FormRadio<
  TValue extends Key,
  TOption = RadioOption<TValue>,
>(
  {
    name,
    className,
    style,
    title,
    actions,
    description,
    optional,
    ...props
  }: FormRadioProps<TValue, TOption>,
  ref: Ref<HTMLDivElement>,
) {
  const [{ value, onBlur }, { error, touched }, { setValue }] = useField(name);

  return (
    <FormField
      ref={ref}
      className={className}
      style={style}
      title={title}
      actions={actions}
      description={description}
      error={touched ? error : undefined}
      optional={optional}
    >
      <Radio
        {...props}
        name={name}
        value={value}
        onChange={setValue}
        onBlur={onBlur}
      />
    </FormField>
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FormRadio;
