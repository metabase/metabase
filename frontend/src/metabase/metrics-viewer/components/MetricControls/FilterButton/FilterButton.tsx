import { useMemo, useState } from "react";
import { t } from "ttag";

import { SimpleDatePicker } from "metabase/querying/common/components/DatePicker/SimpleDatePicker";
import type { DatePickerValue, DatePickerUnit } from "metabase/querying/common/types";
import { Button, Icon, Popover } from "metabase/ui";
import * as LibMetric from "metabase-lib/metric";
import type { DimensionMetadata, MetricDefinition, FilterClause } from "metabase-lib/metric";

import S from "./FilterButton.module.css";

function getFilterDisplayName(value: DatePickerValue | undefined): string {
  if (!value) {
    return t`All time`;
  }

  switch (value.type) {
    case "relative":
      if (value.value === 0) {
        return t`Today`;
      }
      if (value.value < 0) {
        return t`Past ${Math.abs(value.value)} ${value.unit}s`;
      }
      return t`Next ${value.value} ${value.unit}s`;

    case "specific":
      return t`Specific dates`;

    case "exclude":
      return t`Exclude dates`;

    default:
      return t`Filtered`;
  }
}

const DATE_PICKER_UNITS: DatePickerUnit[] = [
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "quarter",
  "year",
];

function isDatePickerUnit(unit: string): unit is DatePickerUnit {
  return DATE_PICKER_UNITS.includes(unit as DatePickerUnit);
}

type FilterButtonProps = {
  definition: MetricDefinition;
  filterDimension: DimensionMetadata;
  filter?: FilterClause;
  filterValue?: DatePickerValue;
  onChange: (value: DatePickerValue | undefined) => void;
};

export function FilterButton({
  definition,
  filterDimension,
  filter,
  filterValue,
  onChange,
}: FilterButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const availableUnits = useMemo(() => {
    const buckets = LibMetric.availableTemporalBuckets(definition, filterDimension);
    return buckets
      .map((b) => LibMetric.displayInfo(definition, b).shortName)
      .filter(isDatePickerUnit);
  }, [definition, filterDimension]);

  const currentValue = useMemo((): DatePickerValue | undefined => {
    if (filterValue) {
      return filterValue;
    }
    if (!filter) {
      return undefined;
    }

    const specificParts = LibMetric.specificDateFilterParts(definition, filter);
    if (specificParts) {
      return {
        type: "specific",
        operator: specificParts.operator,
        values: specificParts.values,
        hasTime: specificParts.hasTime,
      };
    }

    const relativeParts = LibMetric.relativeDateFilterParts(definition, filter);
    if (relativeParts) {
      return {
        type: "relative",
        unit: relativeParts.unit,
        value: relativeParts.value,
        offsetUnit: relativeParts.offsetUnit ?? undefined,
        offsetValue: relativeParts.offsetValue ?? undefined,
        options: relativeParts.options,
      };
    }

    const excludeParts = LibMetric.excludeDateFilterParts(definition, filter);
    if (excludeParts) {
      return {
        type: "exclude",
        operator: excludeParts.operator,
        unit: excludeParts.unit ?? undefined,
        values: excludeParts.values,
      };
    }

    return undefined;
  }, [definition, filter, filterValue]);

  const filterName = getFilterDisplayName(currentValue);

  const handleChange = (value: DatePickerValue | undefined) => {
    onChange(value);
    setIsOpen(false);
  };

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
        <SimpleDatePicker
          value={currentValue}
          availableUnits={availableUnits}
          onChange={handleChange}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
