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
import FormSnippetCollectionWidget from "./widgets/FormSnippetCollectionWidget";
import FormHiddenWidget from "./widgets/FormHiddenWidget";
import FormTextFileWidget from "./widgets/FormTextFileWidget";

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
  snippetCollection: FormSnippetCollectionWidget,
  hidden: FormHiddenWidget,
  textFile: FormTextFileWidget,
};

const FormWidget = ({ field, formField, ...props }) => {
  const Widget =
    (typeof formField.type === "string"
      ? WIDGETS[formField.type]
      : formField.type) || FormInputWidget;
  return <Widget field={field} {...formField} {...props} />;
};

export default FormWidget;
