import { useState } from "react";

import type * as LibMetric from "metabase-lib/metric";

import { FilterDimensionPicker } from "./FilterDimensionPicker";
import { FilterPickerBody } from "./FilterPickerBody";

type FilterPickerProps = {
  definitions: LibMetric.MetricDefinition[];
  onChange: (
    definition: LibMetric.MetricDefinition,
    filter: LibMetric.FilterClause,
  ) => void;
};

export function FilterPicker({ definitions, onChange }: FilterPickerProps) {
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

  const handleBack = () => {
    setDefinition(null);
    setDimension(null);
  };

  if (!definition || !dimension) {
    return (
      <FilterDimensionPicker
        definitions={definitions}
        onChange={handleDimensionChange}
      />
    );
  }

  return (
    <FilterPickerBody
      definition={definition}
      dimension={dimension}
      isNew
      onChange={handleFilterChange}
      onBack={handleBack}
    />
  );
}
