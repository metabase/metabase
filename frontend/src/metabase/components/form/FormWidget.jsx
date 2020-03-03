import React from "react";

import FormInputWidget from "./widgets/FormInputWidget";
import FormEmailWidget from "./widgets/FormEmailWidget";
import FormTextAreaWidget from "./widgets/FormTextAreaWidget";
import FormPasswordWidget from "./widgets/FormPasswordWidget";
import FormCheckBoxWidget from "./widgets/FormCheckBoxWidget";
import FormColorWidget from "./widgets/FormColorWidget";
import FormSelectWidget from "./widgets/FormSelectWidget";
import FormNumericInputWidget from "./widgets/FormNumericInputWidget";
import FormToggleWidget from "./widgets/FormToggleWidget";
import FormCollectionWidget from "./widgets/FormCollectionWidget";
import FormHiddenWidget from "./widgets/FormHiddenWidget";

const WIDGETS = {
  input: FormInputWidget,
  email: FormEmailWidget,
  text: FormTextAreaWidget,
  checkbox: FormCheckBoxWidget,
  color: FormColorWidget,
  password: FormPasswordWidget,
  select: FormSelectWidget,
  integer: FormNumericInputWidget,
  boolean: FormToggleWidget,
  collection: FormCollectionWidget,
  hidden: FormHiddenWidget,
};

const FormWidget = ({ field, formField, ...props }) => {
  const Widget =
    (typeof formField.type === "string"
      ? WIDGETS[formField.type]
      : formField.type) || FormInputWidget;
  return <Widget field={field} {...formField} {...props} />;
};

export default FormWidget;
