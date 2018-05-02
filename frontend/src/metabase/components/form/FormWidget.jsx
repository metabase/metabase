import React from "react";

import FormInputWidget from "./widgets/FormInputWidget";
import FormTextAreaWidget from "./widgets/FormTextAreaWidget";
import FormColorWidget from "./widgets/FormColorWidget";

const WIDGETS = {
  input: FormInputWidget,
  text: FormTextAreaWidget,
  color: FormColorWidget,
};

const FormWidget = ({ type, ...props }) => {
  const Widget = WIDGETS[type] || FormInputWidget;
  return <Widget {...props} />;
};

export default FormWidget;
