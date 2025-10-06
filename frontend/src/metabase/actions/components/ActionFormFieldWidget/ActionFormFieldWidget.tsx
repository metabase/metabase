import type { FunctionComponent, ReactNode, Ref } from "react";
import { forwardRef } from "react";

import type { ActionFormFieldProps } from "metabase/actions/types";
import FormInputWidget from "metabase/common/components/FormInput";
import FormNumericInputWidget from "metabase/common/components/FormNumericInput";
import type { FormRadioProps } from "metabase/common/components/FormRadio";
import FormRadioWidget from "metabase/common/components/FormRadio";
import FormSelectWidget from "metabase/common/components/FormSelect";
import FormTextAreaWidget from "metabase/common/components/FormTextArea";
import FormBooleanWidget from "metabase/common/components/FormToggle";
import type { InputComponentType } from "metabase-types/api";

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
