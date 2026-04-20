import type { DimensionOption } from "metabase/common/components/DimensionPill";
import { DimensionPill } from "metabase/common/components/DimensionPill";
import type { IconName } from "metabase/ui";
import { Flex } from "metabase/ui";
import type { DimensionMetadata } from "metabase-lib/metric";

import type { MetricSourceId } from "../../types/viewer-state";

export interface DimensionItem {
  id: MetricSourceId;
  label?: string;
  icon?: IconName;
  colors?: string[];
  availableOptions: DimensionOption[];
}

export interface DimensionPillBarProps {
  items: DimensionItem[];
  onDimensionChange: (
    itemId: MetricSourceId,
    dimension: DimensionMetadata,
  ) => void;
  onDimensionRemove?: (itemId: MetricSourceId) => void;
  disabled?: boolean;
}

export function DimensionPillBar({
  items,
  onDimensionChange,
  onDimensionRemove,
  disabled,
}: DimensionPillBarProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <Flex
      bg="background-primary"
      p="xs"
      bdrs="xl"
      w="100%"
      align="center"
      justify="center"
      gap="sm"
      wrap="wrap"
      data-testid="metrics-viewer-dimension-pill-container"
    >
      {items.map((item) => (
        <DimensionPill
          key={item.id}
          label={item.label}
          icon={item.icon}
          colors={item.colors}
          options={item.availableOptions}
          onSelect={(dimension) => onDimensionChange(item.id, dimension)}
          onRemove={
            onDimensionRemove ? () => onDimensionRemove(item.id) : undefined
          }
          disabled={disabled}
        />
      ))}
    </Flex>
  );
}
