import React from "react";

import CategoryFieldInput from "./CategoryFieldInput";
import { CategoryWidgetProps } from "./types";

import CategoryRadioPicker from "./CategoryRadioPicker";

const MAX_DISTINCT_OPTIONS_FOR_RADIO_INPUT = 7;

function CategoryFieldPicker({
  value,
  onChange,
  fieldInstance,
}: CategoryWidgetProps) {
  const distinctCount = fieldInstance.fingerprint?.global?.["distinct-count"];

  if (
    distinctCount != null &&
    distinctCount <= MAX_DISTINCT_OPTIONS_FOR_RADIO_INPUT
  ) {
    return (
      <CategoryRadioPicker
        value={value}
        onChange={onChange}
        fieldInstance={fieldInstance}
      />
    );
  }

  return (
    <CategoryFieldInput
      value={value}
      onChange={onChange}
      fieldInstance={fieldInstance}
    />
  );
}

export default CategoryFieldPicker;
