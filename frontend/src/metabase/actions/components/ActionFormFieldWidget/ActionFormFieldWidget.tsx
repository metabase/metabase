import { forwardRef, FunctionComponent, ReactNode, Ref } from "react";

import FormInputWidget from "metabase/core/components/FormInput";
import FormTextAreaWidget from "metabase/core/components/FormTextArea";
import FormRadioWidget, {
  FormRadioProps,
} from "metabase/core/components/FormRadio";
import FormSelectWidget from "metabase/core/components/FormSelect";
import FormNumericInputWidget from "metabase/core/components/FormNumericInput";
import FormBooleanWidget from "metabase/core/components/FormToggle";

import type { InputComponentType } from "metabase-types/api";
import type { ActionFormFieldProps } from "metabase/actions/types";

const VerticalRadio = (props: FormRadioProps) => (
  <FormRadioWidget {...props} vertical />
);

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
