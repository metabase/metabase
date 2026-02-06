import { useMemo, useState } from "react";

import { checkNotNull } from "metabase/lib/types";
import { Select, Stack } from "metabase/ui";
import type * as LibMetric from "metabase-lib/metric";

import {
  getDimensionOptions,
  getDimensionPlaceholder,
  getInitialOption,
} from "./utils";

interface CoordinateDimensionPickerProps {
  definition: LibMetric.MetricDefinition;
  dimension: LibMetric.DimensionMetadata;
  secondDimension: LibMetric.DimensionMetadata | undefined;
  availableDimensions: LibMetric.DimensionMetadata[];
  onChange: (secondDimension: LibMetric.DimensionMetadata) => void;
}

export function CoordinateDimensionPicker({
  definition,
  dimension,
  secondDimension,
  availableDimensions,
  onChange,
}: CoordinateDimensionPickerProps) {
  const options = useMemo(() => {
    return getDimensionOptions(definition, availableDimensions);
  }, [definition, availableDimensions]);

  const [value, setValue] = useState(() => {
    const option = getInitialOption(definition, options, secondDimension);
    return option?.value;
  });

  const handleChange = (value: string | null) => {
    const option = checkNotNull(
      options.find((option) => option.value === value),
    );
    setValue(option.value);
    onChange(option.dimension);
  };

  return (
    <Stack p="md" gap="sm">
      <Select
        data={options}
        value={value}
        placeholder={getDimensionPlaceholder(dimension)}
        onChange={handleChange}
      />
    </Stack>
  );
}
