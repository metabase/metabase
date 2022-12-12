import React, { forwardRef } from "react";
import _ from "underscore";

import type {
  ActionFormFieldProps,
  InputComponentType,
} from "metabase-types/api";

import FormInputWidget from "metabase/core/components/FormInput";
import FormTextAreaWidget from "metabase/core/components/FormTextArea";
import FormRadioWidget from "metabase/core/components/FormRadio";
import FormSelectWidget from "metabase/core/components/FormSelect";
import FormNumericInputWidget from "metabase/core/components/FormNumericInput";
import FormBooleanWidget from "metabase/core/components/FormToggle";
import CategoryFieldPicker from "metabase/core/components/FormCategoryInput";

const VerticalRadio = (props: any) => <FormRadioWidget {...props} vertical />;

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
  category: CategoryFieldPicker,
};

interface FormWidgetProps {
  formField: ActionFormFieldProps;
}

export const FormFieldWidget = forwardRef(function FormFieldWidget(
  { formField }: FormWidgetProps,
  ref: React.Ref<any>,
) {
  const Widget =
    (formField.type ? WIDGETS[formField.type] : FormInputWidget) ??
    FormInputWidget;
  return <Widget {...formField} field={formField} ref={ref} />;
});
