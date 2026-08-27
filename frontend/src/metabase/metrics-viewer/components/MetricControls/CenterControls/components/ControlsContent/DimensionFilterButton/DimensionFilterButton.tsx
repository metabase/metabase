import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { FilterPickerBody } from "metabase/common/metrics/components/FilterPicker/FilterPickerBody";
import {
  trackMetricsViewerFilterAdded,
  trackMetricsViewerFilterEdited,
  trackMetricsViewerFilterRemoved,
} from "metabase/metrics-viewer/analytics";
import {
  type DimensionFilterValue,
  buildDimensionFilterClause,
  parseFilter,
} from "metabase/metrics-viewer/utils";
import { Button, Popover } from "metabase/ui";
import type {
  DimensionMetadata,
  FilterClause,
  MetricDefinition,
} from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

import S from "../../../CenterControls.module.css";

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
          className={S.controlButton}
          justify="space-between"
          h="2rem"
          fw={400}
          py={0}
          px="md"
          bdrs="md"
          variant="subtle"
          color="text-primary"
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
