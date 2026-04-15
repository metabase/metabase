import type { DimensionOption } from "metabase/common/components/DimensionPill";
import { DimensionPill } from "metabase/common/components/DimensionPill";
import type { IconName } from "metabase/ui";
import { Flex } from "metabase/ui";
import type { DimensionMetadata } from "metabase-lib/metric";

import type { MetricSourceId } from "../../types/viewer-state";

import { ExpressionDimensionPill } from "./ExpressionDimensionPill";

// ── Standalone metric pill item ──

export interface MetricDimensionItem {
  type: "metric";
  id: number;
  label?: string;
  icon?: IconName;
  colors?: string[];
  availableOptions: DimensionOption[];
}

// ── Expression pill item (one pill per expression entity) ──

export interface ExpressionMetricSource {
  /** Slot index in dimensionMapping — used as the callback key. */
  slotIndex: number;
  sourceId: MetricSourceId;
  metricName: string;
  metricCount?: number;
  colors?: string[];
  currentDimension?: DimensionMetadata;
  currentDimensionLabel?: string;
  currentDimensionIcon?: IconName;
  availableOptions: DimensionOption[];
}

export interface ExpressionDimensionItem {
  type: "expression";
  /** Expression entity index — used as the React key. */
  id: number;
  colors?: string[];
  icon?: IconName;
  /** Aggregate label derived from selected dimensions. */
  label?: string;
  metricSources: ExpressionMetricSource[];
}

export type DimensionPillBarItem =
  | MetricDimensionItem
  | ExpressionDimensionItem;

// ── Component ──

export interface DimensionPillBarProps {
  items: DimensionPillBarItem[];
  onDimensionChange: (slotIndex: number, dimension: DimensionMetadata) => void;
  onDimensionRemove?: (slotIndex: number) => void;
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
      bg="background-secondary"
      p="sm"
      bdrs="xl"
      w="100%"
      align="center"
      justify="center"
      gap="sm"
      wrap="wrap"
      data-testid="metrics-viewer-dimension-pill-container"
    >
      {items.map((item) =>
        item.type === "expression" ? (
          <ExpressionDimensionPill
            key={`expr-${item.id}`}
            item={item}
            onDimensionChange={onDimensionChange}
            disabled={disabled}
          />
        ) : (
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
        ),
      )}
    </Flex>
  );
}
