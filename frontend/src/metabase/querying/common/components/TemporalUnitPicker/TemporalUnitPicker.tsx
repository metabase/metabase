import { useState } from "react";
import { t } from "ttag";

import { Box, DefaultSelectItem, Text } from "metabase/ui";
import type { TemporalUnit } from "metabase-types/api";

const MIN_WIDTH = 180;
const INITIAL_VISIBLE_ITEMS_COUNT = 7;

export interface TemporalUnitItem {
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
      {availableItems.length === 0 && (
        <Text px="sm" c="text-tertiary">{t`No options`}</Text>
      )}
      {visibleItems.map((item) => (
        <DefaultSelectItem
          key={item.value}
          value={item.value}
          label={item.label}
          selected={item.value === value}
          onClick={() => onChange(item.value)}
          role="option"
        />
      ))}
      {!isExpanded && (
        <DefaultSelectItem
          value={t`More…`}
          c="brand"
          onClick={() => setIsExpanded(true)}
          role="option"
        />
      )}
      {isExpanded && canRemove && (
        <DefaultSelectItem
          value={t`Don't bin`}
          onClick={onRemove}
          role="option"
        />
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
      availableItems.findIndex((item) => item.value === value) >=
        INITIAL_VISIBLE_ITEMS_COUNT)
  );
}
