import { forwardRef } from "react";
import * as React from "react";

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

const WIDGETS: Record<InputComponentType, React.FunctionComponent<any>> = {
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
}

export const ActionFormFieldWidget = forwardRef(function FormFieldWidget(
  { formField }: FormWidgetProps,
  ref: React.Ref<any>,
) {
  const Widget =
    (formField.type ? WIDGETS[formField.type] : FormInputWidget) ??
    FormInputWidget;

  return <Widget {...formField} nullable ref={ref} />;
});
