import { useMemo, useState } from "react";
import { t } from "ttag";

import { TemporalFilterPicker } from "metabase/metrics/components/TemporalFilterPicker";
import type { DimensionWithDefinition } from "metabase/metrics/types";
import { getDatePickerValue } from "metabase/metrics/utils/dates";
import type { DatePickerValue } from "metabase/querying/common/types";
import { getDateFilterDisplayName } from "metabase/querying/filters/utils/dates";
import { Button, Icon, Popover } from "metabase/ui";
import type { DimensionMetadata, FilterClause, MetricDefinition } from "metabase-lib/metric";

import S from "./FilterButton.module.css";

type FilterButtonProps = {
  definition: MetricDefinition;
  filterDimension: DimensionMetadata;
  filter?: FilterClause;
  onChange: (value: DatePickerValue | undefined) => void;
};

export function FilterButton({
  definition,
  filterDimension,
  filter,
  onChange,
}: FilterButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const dimensions = useMemo<DimensionWithDefinition[]>(
    () => [{ definition, dimension: filterDimension }],
    [definition, filterDimension],
  );

  const currentValue = useMemo(
    () => (filter ? getDatePickerValue(definition, filter) : undefined),
    [definition, filter],
  );

  const filterName = currentValue
    ? getDateFilterDisplayName(currentValue)
    : t`All time`;

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
        <TemporalFilterPicker
          dimensions={dimensions}
          selectedFilter={currentValue}
          onSelect={handleChange}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
