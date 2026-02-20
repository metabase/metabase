import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { FilterPickerBody } from "metabase/metrics/components/FilterPicker/FilterPickerBody";
import { getDatePickerValue } from "metabase/metrics/utils/dates";
import { getDateFilterDisplayName } from "metabase/querying/common/utils/dates";
import { Button, Icon, Popover } from "metabase/ui";
import * as Lib from "metabase-lib";
import type {
  DimensionMetadata,
  FilterClause,
  MetricDefinition,
} from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

import type { DimensionFilterValue } from "../../../utils/metrics";
import {
  buildDimensionFilterClause,
  extractDimensionFilterValue,
} from "../../../utils/metrics";
import S from "../MetricControls.module.css";

function getFilterDisplayName(
  definition: MetricDefinition,
  filterClause: FilterClause,
  dimensionFilter: DimensionFilterValue,
): string {
  const datePickerValue = getDatePickerValue(definition, filterClause);
  if (datePickerValue) {
    return getDateFilterDisplayName(datePickerValue);
  }

  switch (dimensionFilter.type) {
    case "string": {
      const operator = Lib.describeFilterOperator(
        dimensionFilter.operator,
      ).toLowerCase();
      if (dimensionFilter.values.length === 0) {
        return operator;
      }
      return `${operator} ${dimensionFilter.values.join(", ")}`;
    }
    case "boolean": {
      if (
        dimensionFilter.operator === "=" &&
        dimensionFilter.values.length > 0
      ) {
        return dimensionFilter.values[0] ? t`True` : t`False`;
      }
      return Lib.describeFilterOperator(dimensionFilter.operator).toLowerCase();
    }
    case "number": {
      const operator = Lib.describeFilterOperator(
        dimensionFilter.operator,
      ).toLowerCase();
      if (dimensionFilter.values.length === 0) {
        return operator;
      }
      return `${operator} ${dimensionFilter.values.join(", ")}`;
    }
    case "coordinate": {
      const operator = Lib.describeFilterOperator(
        dimensionFilter.operator,
      ).toLowerCase();
      return `${operator} ${dimensionFilter.values.join(", ")}`;
    }
    case "time": {
      const operator = Lib.describeFilterOperator(
        dimensionFilter.operator,
      ).toLowerCase();
      const formattedValues = dimensionFilter.values
        .map((date) => date.toLocaleTimeString())
        .join(", ");
      return `${operator} ${formattedValues}`;
    }
    case "default": {
      return Lib.describeFilterOperator(dimensionFilter.operator).toLowerCase();
    }
    default:
      return "";
  }
}

type DimensionFilterButtonProps = {
  definition: MetricDefinition;
  filterDimension: DimensionMetadata;
  filter?: FilterClause;
  dimensionFilter?: DimensionFilterValue;
  onChange: (value: DimensionFilterValue | undefined) => void;
};

export function DimensionFilterButton({
  definition,
  filterDimension,
  filter,
  dimensionFilter,
  onChange,
}: DimensionFilterButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const reconstructedFilter = useMemo((): FilterClause | undefined => {
    if (filter) {
      return filter;
    }
    if (dimensionFilter) {
      return buildDimensionFilterClause(filterDimension, dimensionFilter);
    }
    return undefined;
  }, [filter, dimensionFilter, filterDimension]);

  const isDateDimension = LibMetric.isDateOrDateTime(filterDimension);

  const filterName = useMemo(() => {
    if (reconstructedFilter && dimensionFilter) {
      return getFilterDisplayName(
        definition,
        reconstructedFilter,
        dimensionFilter,
      );
    }
    if (isDateDimension) {
      return t`All time`;
    }
    return t`All values`;
  }, [reconstructedFilter, dimensionFilter, definition, isDateDimension]);

  const handleSelect = useCallback(
    (filterClause: FilterClause) => {
      const extracted = extractDimensionFilterValue(definition, filterClause);
      if (extracted) {
        onChange(extracted);
      }
      setIsOpen(false);
    },
    [definition, onChange],
  );

  const handleClear = useCallback(() => {
    onChange(undefined);
    setIsOpen(false);
  }, [onChange]);

  return (
    <Popover opened={isOpen} onChange={setIsOpen}>
      <Popover.Target>
        <Button
          className={S.controlButton}
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
          onSelect={handleSelect}
          onClear={reconstructedFilter ? handleClear : undefined}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
