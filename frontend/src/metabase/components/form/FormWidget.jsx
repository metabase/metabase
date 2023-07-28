/* eslint-disable react/prop-types */
import { forwardRef } from "react";

import { PLUGIN_FORM_WIDGETS } from "metabase/plugins";

import FormInfoWidget from "./widgets/FormInfoWidget";
import FormInputWidget from "./widgets/FormInputWidget";
import FormEmailWidget from "./widgets/FormEmailWidget";
import FormTextAreaWidget from "./widgets/FormTextAreaWidget";
import FormPasswordWidget from "./widgets/FormPasswordWidget";
import FormRadioWidget from "./widgets/FormRadioWidget";
import FormCheckBoxWidget from "./widgets/FormCheckBoxWidget";
import FormColorWidget from "./widgets/FormColorWidget";
import FormSectionWidget from "./widgets/FormSectionWidget";
import FormSelectWidget from "./widgets/FormSelectWidget";
import FormNumericInputWidget from "./widgets/FormNumericInputWidget";
import FormBooleanWidget from "./widgets/FormBooleanWidget";
import FormCollectionWidget from "./widgets/FormCollectionWidget";
import FormSnippetCollectionWidget from "./widgets/FormSnippetCollectionWidget";
import FormHiddenWidget from "./widgets/FormHiddenWidget";
import FormTextFileWidget from "./widgets/FormTextFileWidget";

const WIDGETS = {
  info: FormInfoWidget,
  input: FormInputWidget,
  email: FormEmailWidget,
  text: FormTextAreaWidget,
  checkbox: FormCheckBoxWidget,
  color: FormColorWidget,
  password: FormPasswordWidget,
  radio: FormRadioWidget,
  section: FormSectionWidget,
  select: FormSelectWidget,
  integer: FormNumericInputWidget,
  boolean: FormBooleanWidget,
  collection: FormCollectionWidget,
  snippetCollection: FormSnippetCollectionWidget,
  hidden: FormHiddenWidget,
  textFile: FormTextFileWidget,
};

export function getWidgetComponent(formField) {
  if (typeof formField.type === "string") {
    const widget =
      WIDGETS[formField.type] || PLUGIN_FORM_WIDGETS[formField.type];
    return widget || FormInputWidget;
  }
  return formField.type || FormInputWidget;
}

/**
 * @deprecated
 */
const FormWidget = forwardRef(function FormWidget(
  { field, formField, ...props },
  ref,
) {
  const Widget = getWidgetComponent(formField);
  return <Widget field={field} {...formField} {...props} ref={ref} />;
});

export default FormWidget;
