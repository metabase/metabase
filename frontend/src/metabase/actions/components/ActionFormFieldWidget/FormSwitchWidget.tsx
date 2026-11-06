import { useField } from "formik";
import type { ChangeEvent, ReactNode, Ref } from "react";
import { forwardRef } from "react";

import type { ActionFormFieldProps } from "metabase/actions/types";
import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import { FormField } from "metabase/forms";
import { Flex, Switch } from "metabase/ui";

type FormSwitchWidgetProps = ActionFormFieldProps & {
  actions?: ReactNode;
  disabled?: boolean;
};

export const FormSwitchWidget = forwardRef(function FormSwitchWidget(
  {
    name,
    title,
    actions,
    description,
    optional,
    disabled,
  }: FormSwitchWidgetProps,
  ref: Ref<HTMLInputElement>,
) {
  const id = useUniqueId();
  const [{ value, onBlur }, { error, touched }, { setValue }] =
    useField<boolean>(name);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setValue(event.currentTarget.checked);
  };

  return (
    <Flex
      justify="space-between"
      align={description ? "flex-start" : "center"}
      gap="sm"
    >
      <FormField
        flex={1}
        title={title}
        actions={actions}
        description={description}
        optional={optional}
        error={touched ? error : undefined}
        htmlFor={id}
      />
      <Switch
        ref={ref}
        id={id}
        name={name}
        checked={value ?? false}
        disabled={disabled}
        onChange={handleChange}
        onBlur={onBlur}
      />
    </Flex>
  );
});
