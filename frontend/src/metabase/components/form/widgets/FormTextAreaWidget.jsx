import React from "react";

const FormTextAreaWidget = ({ placeholder, field }) => (
  <textarea className="Form-input full" placeholder={placeholder} {...field} />
);

export default FormTextAreaWidget;
