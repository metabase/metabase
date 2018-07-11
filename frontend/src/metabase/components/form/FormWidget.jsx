import React from "react";

import FormInputWidget from "./widgets/FormInputWidget";
import FormTextAreaWidget from "./widgets/FormTextAreaWidget";
import FormPasswordWidget from "./widgets/FormPasswordWidget";
import FormColorWidget from "./widgets/FormColorWidget";
import FormSelectWidget from "./widgets/FormSelectWidget";
import FormHiddenWidget from "./widgets/FormHiddenWidget";

const WIDGETS = {
  input: FormInputWidget,
  text: FormTextAreaWidget,
  color: FormColorWidget,
  password: FormPasswordWidget,
  select: FormSelectWidget,
  hidden: FormHiddenWidget,
};

const FormWidget = ({ type, ...props }) => {
  const Widget =
    (typeof type === "string" ? WIDGETS[type] : type) || FormInputWidget;
  return <Widget {...props} />;
};

export default FormWidget;
