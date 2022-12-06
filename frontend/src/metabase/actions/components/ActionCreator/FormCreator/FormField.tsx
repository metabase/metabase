import React from "react";
import type { FieldSettings } from "metabase-types/api";
import type { Parameter } from "metabase-types/types/Parameter";

import { getWidgetComponent } from "metabase/components/form/FormWidget";

import { getFormField } from "./utils";

// sample form fields
export function FormField({
  param,
  fieldSettings,
}: {
  param: Parameter;
  fieldSettings: FieldSettings;
}) {
  const fieldProps = getFormField(param, fieldSettings);
  const InputField = getWidgetComponent(fieldProps);
  return <InputField field={fieldProps} {...fieldProps} />;
}
