import { useState } from "react";

import type * as LibMetric from "metabase-lib/metric";

import { FilterDimensionPicker } from "./FilterDimensionPicker";
import { FilterPickerBody } from "./FilterPickerBody";

type MetricFilterPickerProps = {
  definitions: LibMetric.MetricDefinition[];
  onChange: (
    definition: LibMetric.MetricDefinition,
    filter: LibMetric.FilterClause,
  ) => void;
  onBack?: () => void;
};

export function MetricFilterPicker({
  definitions,
  onChange,
  onBack,
}: MetricFilterPickerProps) {
  const [definition, setDefinition] =
    useState<LibMetric.MetricDefinition | null>(null);
  const [dimension, setDimension] =
    useState<LibMetric.DimensionMetadata | null>(null);

  const handleDimensionChange = (
    definition: LibMetric.MetricDefinition,
    dimension: LibMetric.DimensionMetadata,
  ) => {
    setDefinition(definition);
    setDimension(dimension);
  };

  const handleFilterChange = (filter: LibMetric.FilterClause) => {
    if (!definition) {
      return;
    }
    onChange(definition, filter);
  };

  if (!definition || !dimension) {
    return (
      <FilterDimensionPicker
        definitions={definitions}
        onChange={handleDimensionChange}
        onBack={onBack}
      />
    );
  }

  return (
    <FilterPickerBody
      definition={definition}
      dimension={dimension}
      isNew
      onChange={handleFilterChange}
      onBack={onBack}
    />
  );
}
