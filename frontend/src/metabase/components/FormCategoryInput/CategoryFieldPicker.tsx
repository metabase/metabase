import React from "react";

import CategoryFieldInput from "./CategoryFieldInput";
import { CategoryWidgetProps } from "./types";

import CategoryRadioPicker from "./CategoryRadioPicker";

const MAX_DISTINCT_OPTIONS_FOR_RADIO_INPUT = 7;

function CategoryFieldPicker({ value, onChange, field }: CategoryWidgetProps) {
  const distinctCount = field.fingerprint?.global?.["distinct-count"];

  if (
    distinctCount != null &&
    distinctCount <= MAX_DISTINCT_OPTIONS_FOR_RADIO_INPUT
  ) {
    return (
      <CategoryRadioPicker value={value} onChange={onChange} field={field} />
    );
  }

  return <CategoryFieldInput value={value} onChange={onChange} field={field} />;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CategoryFieldPicker;
