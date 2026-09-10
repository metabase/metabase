import { useMemo, useState } from "react";
import { t } from "ttag";

import { FilterPickerBody } from "metabase/common/metrics/components/FilterPicker/FilterPickerBody";
import type { DimensionFilterValue } from "metabase/common/metrics-viewer";
import { MetricsFilterPill } from "metabase/metrics-viewer/components/MetricsFilterPills/MetricsFilterPill";
import { getFilterDisplayParts } from "metabase/metrics-viewer/components/MetricsFilterPills/utils";
import {
  buildDimensionFilterClause,
  parseFilter,
} from "metabase/metrics-viewer/utils/dimension-filters";
import { Popover, Text } from "metabase/ui";
import type { FilterClause } from "metabase-lib/metric";

import type { CubeDimension } from "../../types";
import { getDimensionTypeIcon } from "../../utils/dimension-icons";
import type { ReferenceFilterDimension } from "../../utils/reference-definition";

export interface DimensionFilterPillProps {
  dimension: CubeDimension;
  reference: ReferenceFilterDimension;
  value: DimensionFilterValue | undefined;
  onChange: (value: DimensionFilterValue) => void;
  onClear: () => void;
}

export function DimensionFilterPill({
  dimension,
  reference,
  value,
  onChange,
  onClear,
}: DimensionFilterPillProps) {
  const [isOpened, setIsOpened] = useState(false);

  const filterClause = useMemo(
    () =>
      value != null
        ? buildDimensionFilterClause(reference.dimension, value)
        : undefined,
    [reference.dimension, value],
  );
  const displayParts = useMemo(
    () =>
      filterClause != null
        ? getFilterDisplayParts(reference.definition, filterClause)
        : null,
    [reference.definition, filterClause],
  );

  const handleSelect = (clause: FilterClause) => {
    const parsed = parseFilter(reference.definition, clause);
    if (parsed) {
      onChange(parsed.value);
    }
    setIsOpened(false);
  };

  const handleClear = () => {
    onClear();
    setIsOpened(false);
  };

  return (
    <Popover
      opened={isOpened}
      position="bottom-start"
      transitionProps={{ duration: 0 }}
      onChange={setIsOpened}
    >
      <Popover.Target>
        <MetricsFilterPill
          colors={[]}
          fallbackIcon={getDimensionTypeIcon(dimension.type)}
          aria-label={t`Filter by ${dimension.label}`}
          onClick={() => setIsOpened((prev) => !prev)}
          onRemoveClick={value != null ? handleClear : undefined}
        >
          {displayParts ? (
            <>
              {displayParts.label}
              {displayParts.value && (
                <Text component="span" fw={700} c="inherit" fz="inherit" lh="1">
                  {" "}
                  {displayParts.value}
                </Text>
              )}
            </>
          ) : (
            dimension.label
          )}
        </MetricsFilterPill>
      </Popover.Target>
      <Popover.Dropdown>
        <FilterPickerBody
          definition={reference.definition}
          dimension={reference.dimension}
          filter={filterClause}
          isNew={filterClause == null}
          onSelect={handleSelect}
          onClear={value != null ? handleClear : undefined}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
