import React from "react";

import CategoryFieldInput from "./CategoryFieldInput";
import { CategoryWidgetProps } from "./types";

import CategoryRadioPicker from "./CategoryRadioPicker";

const MAX_DISTINCT_OPTIONS_FOR_RADIO_INPUT = 7;

function CategoryFieldPicker({ field, fieldInstance }: CategoryWidgetProps) {
  const { value } = field;

  const distinctCount = fieldInstance.fingerprint?.global?.["distinct-count"];

  if (
    distinctCount != null &&
    distinctCount <= MAX_DISTINCT_OPTIONS_FOR_RADIO_INPUT
  ) {
    return <CategoryRadioPicker field={field} fieldInstance={fieldInstance} />;
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
