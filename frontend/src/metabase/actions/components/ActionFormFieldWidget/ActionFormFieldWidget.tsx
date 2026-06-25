import type { FunctionComponent, ReactNode, Ref } from "react";
import { forwardRef } from "react";

import type { ActionFormFieldProps } from "metabase/actions/types";
import { FormField } from "metabase/common/components/FormField";
import { FormInput as FormInputWidget } from "metabase/common/components/FormInput";
import { FormNumericInput as FormNumericInputWidget } from "metabase/common/components/FormNumericInput";
import { FormTextArea as FormTextAreaWidget } from "metabase/common/components/FormTextArea";
import { FormToggle as FormBooleanWidget } from "metabase/common/components/FormToggle";
import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import { FormRadioGroup, type FormRadioGroupProps } from "metabase/forms";
import { FormSelect } from "metabase/forms/components/FormSelect";
import { Radio, Stack } from "metabase/ui";
import type { InputComponentType } from "metabase-types/api";

type RadioOption = {
  name: string;
  // Radio.Group in our forms provides string values; stringify numeric values when rendering
  value: string | number;
};

interface FormRadioProps extends FormRadioGroupProps {
  title?: string;
  options: RadioOption[];
  actions?: ReactNode;
  description?: ReactNode;
  optional?: boolean;
}

const VerticalRadio = (props: FormRadioProps) => {
  return (
    <FormRadioGroup name={props.name} label={props.title}>
      <Stack gap="sm" mt="xs">
        {props.options.map((r) => (
          // The value that comes from the `FormRadioGroup` wrapper is a string.
          // It is crucial to match it properly or otherwise a radio button will
          // not render as checked/selected.
          // This is important because this component is used to render "Inline select"
          // for both the string and the numeric variables!
          <Radio label={r.name} key={r.value} value={r.value.toString()} />
        ))}
      </Stack>
    </FormRadioGroup>
  );
};

type FormSelectWidgetProps = ActionFormFieldProps & {
  actions?: ReactNode;
  disabled?: boolean;
  nullable?: boolean;
};

const FormSelectWidget = forwardRef(function FormSelectWidget(
  {
    title,
    description,
    actions,
    optional,
    options = [],
    type,
    field,
    ...props
  }: FormSelectWidgetProps,
  ref: Ref<HTMLInputElement>,
) {
  const id = useUniqueId();
  const data = options.map((option) => ({
    value: String(option.value),
    label: String(option.name),
  }));

  return (
    <FormField
      title={title}
      actions={actions}
      description={description}
      htmlFor={id}
      optional={optional}
    >
      <FormSelect ref={ref} id={id} size="sm" data={data} {...props} />
    </FormField>
  );
});

const WIDGETS: Record<InputComponentType, FunctionComponent<any>> = {
  text: FormInputWidget,
  date: FormInputWidget,
  time: FormInputWidget,
  "datetime-local": FormInputWidget,
  textarea: FormTextAreaWidget,
  number: FormNumericInputWidget,
  boolean: FormBooleanWidget,
  radio: VerticalRadio,
  select: FormSelectWidget,
};

interface FormWidgetProps {
  formField: ActionFormFieldProps;
  hidden?: boolean;
  actions?: ReactNode;
}

export const ActionFormFieldWidget = forwardRef(function FormFieldWidget(
  { formField, hidden, actions }: FormWidgetProps,
  ref: Ref<any>,
) {
  const Widget =
    (formField.type ? WIDGETS[formField.type] : FormInputWidget) ??
    FormInputWidget;

  return (
    <Widget
      {...formField}
      disabled={hidden}
      actions={actions}
      nullable
      ref={ref}
    />
  );
});
