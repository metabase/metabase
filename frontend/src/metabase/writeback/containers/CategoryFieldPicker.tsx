import React from "react";

import { CategoryWidgetProps } from "../types";
import CategoryRadioPicker from "./CategoryRadioPicker";

import CategoryFieldInput from "../components/CategoryFieldInput";

const MAX_DISTINCT_OPTIONS_FOR_RADIO_INPUT = 7;

function CategoryFieldPicker({ field, formField }: CategoryWidgetProps) {
  const { value } = field;
  const { fieldInstance } = formField;

  const distinctCount = fieldInstance.fingerprint?.global?.["distinct-count"];

  if (
    distinctCount != null &&
    distinctCount <= MAX_DISTINCT_OPTIONS_FOR_RADIO_INPUT
  ) {
    return <CategoryRadioPicker field={field} formField={formField} />;
  }

  return (
    <CategoryFieldInput
      value={value}
      field={fieldInstance}
      onChange={field.onChange}
    />
  );
}

export default CategoryFieldPicker;
