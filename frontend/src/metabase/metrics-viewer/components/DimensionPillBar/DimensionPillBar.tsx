import type { DimensionOption } from "metabase/common/components/DimensionPill";
import { SourceColorIndicator } from "metabase/common/components/SourceColorIndicator";
import { Flex, Text } from "metabase/ui";
import type { DimensionMetadata } from "metabase-lib/metric";
import type { IconName } from "metabase-types/api";

import type { MetricSourceId } from "../../types/viewer-state";

import S from "./DimensionPillBar.module.css";

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
}

export function DimensionPillBar({ items }: DimensionPillBarProps) {
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
      {items.map((item) =>
        item.type === "expression" ? (
          <DimensionLabel
            key={`expr-${item.id}`}
            label={item.label}
            icon={item.icon}
            colors={item.colors}
          />
        ) : (
          <DimensionLabel
            key={item.id}
            label={item.label}
            icon={item.icon}
            colors={item.colors}
          />
        ),
      )}
    </Flex>
  );
}

function DimensionLabel({
  label,
  icon,
  colors,
}: {
  label?: string;
  icon?: IconName;
  colors?: string[];
}) {
  if (!label) {
    return null;
  }

  return (
    <Flex align="center" gap="xs" className={S.label}>
      <SourceColorIndicator
        colors={colors}
        fallbackIcon={icon ?? "add"}
        size={12}
      />
      <Text size="sm" lh="1rem" c="text-primary">
        {label}
      </Text>
    </Flex>
  );
}
