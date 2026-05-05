import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { FilterPickerBody } from "metabase/metrics/components/FilterPicker/FilterPickerBody";
import {
  trackMetricsViewerFilterAdded,
  trackMetricsViewerFilterEdited,
  trackMetricsViewerFilterRemoved,
} from "metabase/metrics-viewer/analytics";
import { Button, Icon, Popover } from "metabase/ui";
import type {
  DimensionMetadata,
  FilterClause,
  MetricDefinition,
} from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

import type { DimensionFilterValue } from "../../../utils/dimension-filters";
import {
  buildDimensionFilterClause,
  parseFilter,
} from "../../../utils/dimension-filters";

import { getFilterDisplayName } from "./utils";

type DimensionFilterButtonProps = {
  definition: MetricDefinition;
  filterDimension: DimensionMetadata;
  dimensionFilter?: DimensionFilterValue;
  allFilterDimensions?: DimensionMetadata[];
  onChange: (value: DimensionFilterValue | undefined) => void;
};

export function DimensionFilterButton({
  definition,
  filterDimension,
  dimensionFilter,
  allFilterDimensions,
  onChange,
}: DimensionFilterButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const reconstructedFilter = useMemo((): FilterClause | undefined => {
    if (dimensionFilter) {
      return buildDimensionFilterClause(filterDimension, dimensionFilter);
    }
    return undefined;
  }, [dimensionFilter, filterDimension]);

  const isDateDimension = LibMetric.isDateOrDateTime(filterDimension);

  const filterName = useMemo(() => {
    if (dimensionFilter) {
      return getFilterDisplayName(dimensionFilter);
    }
    if (isDateDimension) {
      return t`All time`;
    }
    return t`All values`;
  }, [dimensionFilter, isDateDimension]);

  const handleSelect = useCallback(
    (filterClause: FilterClause) => {
      const parsed = parseFilter(definition, filterClause);
      if (parsed) {
        onChange(parsed.value);
        if (dimensionFilter) {
          trackMetricsViewerFilterEdited("dimension_filter");
        } else {
          trackMetricsViewerFilterAdded("dimension_filter");
        }
      }
      setIsOpen(false);
    },
    [definition, onChange, dimensionFilter],
  );

  const handleClear = useCallback(() => {
    onChange(undefined);
    trackMetricsViewerFilterRemoved("dimension_filter");
    setIsOpen(false);
  }, [onChange]);

  return (
    <Popover opened={isOpen} onChange={setIsOpen}>
      <Popover.Target>
        <Button
          w={184}
          justify="space-between"
          fw="bold"
          py="xs"
          px="sm"
          variant="subtle"
          color="text-primary"
          rightSection={<Icon name="chevrondown" size={12} />}
          onClick={() => setIsOpen(!isOpen)}
        >
          {filterName}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <FilterPickerBody
          definition={definition}
          dimension={filterDimension}
          filter={reconstructedFilter}
          isNew={!reconstructedFilter}
          allFilterDimensions={allFilterDimensions}
          onSelect={handleSelect}
          onClear={reconstructedFilter ? handleClear : undefined}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
