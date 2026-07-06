import { useField } from "formik";
import type { ReactNode, Ref } from "react";
import { forwardRef, useCallback } from "react";

import type { ActionFormFieldProps } from "metabase/actions/types";
import { FormField } from "metabase/common/components/FormField";
import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import { NumberInput } from "metabase/ui";

type FormNumberInputWidgetProps = ActionFormFieldProps & {
  actions?: ReactNode;
  disabled?: boolean;
  nullable?: boolean;
};

export const FormNumberInputWidget = forwardRef(function FormNumberInputWidget(
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
  }: FormNumberInputWidgetProps,
  ref: Ref<HTMLInputElement>,
) {
  const id = useUniqueId();
  const [{ value }, { error, touched }, { setValue, setTouched }] =
    useField(name);

  const handleChange = useCallback(
    (newValue: number | string) => {
      if (newValue === "") {
        setValue(nullable ? null : undefined);
      } else {
        setValue(newValue);
      }
    },
    [nullable, setValue],
  );

  return (
    <FormField
      title={title}
      actions={actions}
      description={description}
      htmlFor={id}
      error={touched ? error : undefined}
      optional={optional}
    >
      <NumberInput
        ref={ref}
        id={id}
        name={name}
        size="sm"
        value={value ?? ""}
        error={touched && Boolean(error)}
        onChange={handleChange}
        onBlur={() => setTouched(true)}
        {...props}
      />
    </FormField>
  );
});
