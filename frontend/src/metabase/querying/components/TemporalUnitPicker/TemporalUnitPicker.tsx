import { useState } from "react";
import { t } from "ttag";

import { Box, SelectItem } from "metabase/ui";
import type { TemporalUnit } from "metabase-types/api";

const MIN_WIDTH = 180;
const INITIAL_VISIBLE_ITEMS_COUNT = 7;

interface TemporalUnitItem {
  value: TemporalUnit;
  label: string;
}

interface TemporalUnitPickerProps {
  value: TemporalUnit | undefined;
  availableItems: TemporalUnitItem[];
  canRemove?: boolean;
  onChange: (newValue: TemporalUnit) => void;
  onRemove?: () => void;
}

export function TemporalUnitPicker({
  value,
  availableItems,
  canRemove,
  onChange,
  onRemove,
}: TemporalUnitPickerProps) {
  const [isExpanded, setIsExpanded] = useState(() =>
    isInitiallyExpanded(value, availableItems),
  );
  const visibleItems = isExpanded
    ? availableItems
    : availableItems.slice(0, INITIAL_VISIBLE_ITEMS_COUNT);

  return (
    <Box p="sm" miw={MIN_WIDTH}>
      {visibleItems.map(item => (
        <SelectItem
          key={item.value}
          value={item.value}
          label={item.label}
          selected={item.value === value}
          onClick={() => onChange(item.value)}
        />
      ))}
      {!isExpanded && (
        <SelectItem
          value={t`More…`}
          c="brand"
          onClick={() => setIsExpanded(true)}
        />
      )}
      {isExpanded && canRemove && (
        <SelectItem value={t`Don't bin`} onClick={onRemove} />
      )}
    </Box>
  );
}

function isInitiallyExpanded(
  value: TemporalUnit | undefined,
  availableItems: TemporalUnitItem[],
) {
  return (
    availableItems.length <= INITIAL_VISIBLE_ITEMS_COUNT ||
    (value != null &&
      availableItems.findIndex(item => item.value === value) >=
        INITIAL_VISIBLE_ITEMS_COUNT)
  );
}
