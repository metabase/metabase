import { type Ref, forwardRef, useState } from "react";
import { t } from "ttag";

import { Button, Icon } from "metabase/ui";
import type * as LibMetric from "metabase-lib/metric";

import { FilterDimensionPicker } from "./FilterDimensionPicker";
import { FilterPickerBody } from "./FilterPickerBody";

type FilterPickerProps = {
  definitions: LibMetric.MetricDefinition[];
  onSelect: (
    definition: LibMetric.MetricDefinition,
    definitionIndex: number,
    filter: LibMetric.FilterClause,
  ) => void;
};

export function FilterPicker({ definitions, onSelect }: FilterPickerProps) {
  const [definition, setDefinition] =
    useState<LibMetric.MetricDefinition | null>(null);
  const [definitionIndex, setDefinitionIndex] = useState<number | null>(null);
  const [dimension, setDimension] =
    useState<LibMetric.DimensionMetadata | null>(null);

  const handleDimensionSelect = (
    definition: LibMetric.MetricDefinition,
    definitionIndex: number,
    dimension: LibMetric.DimensionMetadata,
  ) => {
    setDefinition(definition);
    setDefinitionIndex(definitionIndex);
    setDimension(dimension);
  };

  const handleFilterSelect = (filter: LibMetric.FilterClause) => {
    if (definition == null || definitionIndex == null) {
      return;
    }
    onSelect(definition, definitionIndex, filter);
  };

  const handleBack = () => {
    setDefinition(null);
    setDimension(null);
  };

  if (!definition || !dimension) {
    return (
      <FilterDimensionPicker
        definitions={definitions}
        onSelect={handleDimensionSelect}
      />
    );
  }

  return (
    <FilterPickerBody
      definition={definition}
      dimension={dimension}
      isNew
      onSelect={handleFilterSelect}
      onBack={handleBack}
    />
  );
}

type FilterPickerButtonProps = {
  onClick?: () => void;
};

export const FilterPickerButton = forwardRef(function FilterPickerButton(
  { onClick }: FilterPickerButtonProps,
  ref: Ref<HTMLButtonElement>,
) {
  return (
    <Button ref={ref} leftSection={<Icon name="filter" />} onClick={onClick}>
      {t`Filter`}
    </Button>
  );
});
