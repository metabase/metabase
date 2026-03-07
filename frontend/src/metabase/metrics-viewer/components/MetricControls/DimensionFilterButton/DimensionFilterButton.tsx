import { useCallback, useMemo, useState } from "react";
import { match } from "ts-pattern";
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
  parseFilter,
} from "../../../utils/metrics";

function getFilterDisplayName(
  definition: MetricDefinition,
  filterClause: FilterClause,
  dimensionFilter: DimensionFilterValue,
): string {
  const datePickerValue = getDatePickerValue(definition, filterClause);
  if (datePickerValue) {
    return getDateFilterDisplayName(datePickerValue);
  }

  return match(dimensionFilter)
    .with({ type: "boolean" }, (filter) => {
      if (filter.operator === "=" && filter.values.length > 0) {
        return filter.values[0] ? t`True` : t`False`;
      }
      return Lib.describeFilterOperator(filter.operator).toLowerCase();
    })
    .with({ type: "time" }, (filter) => {
      const operator = Lib.describeFilterOperator(
        filter.operator,
      ).toLowerCase();
      const formattedValues = filter.values
        .map((date) => date.toLocaleTimeString())
        .join(", ");
      return `${operator} ${formattedValues}`;
    })
    .with(
      { type: "string" },
      { type: "number" },
      { type: "coordinate" },
      (filter) => {
        const operator = Lib.describeFilterOperator(
          filter.operator,
        ).toLowerCase();
        if (filter.values.length === 0) {
          return operator;
        }
        return `${operator} ${filter.values.join(", ")}`;
      },
    )
    .with({ type: "default" }, (filter) =>
      Lib.describeFilterOperator(filter.operator).toLowerCase(),
    )
    .exhaustive();
}

type DimensionFilterButtonProps = {
  definition: MetricDefinition;
  filterDimension: DimensionMetadata;
  filter?: FilterClause;
  dimensionFilter?: DimensionFilterValue;
  allFilterDimensions?: DimensionMetadata[];
  onChange: (value: DimensionFilterValue | undefined) => void;
};

export function DimensionFilterButton({
  definition,
  filterDimension,
  filter,
  dimensionFilter,
  allFilterDimensions,
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
      const parsed = parseFilter(definition, filterClause);
      if (parsed) {
        onChange(parsed.value);
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
