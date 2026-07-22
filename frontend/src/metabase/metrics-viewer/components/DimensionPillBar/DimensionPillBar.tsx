import type { DimensionOption } from "metabase/common/components/DimensionPill";
import { SourceColorIndicator } from "metabase/common/components/SourceColorIndicator";
import { Flex, Text } from "metabase/ui";
import type { DimensionMetadata } from "metabase-lib/metric";
import type { IconName } from "metabase-types/api";

import type { MetricSourceId } from "../../types";

import S from "./DimensionPillBar.module.css";

// ── Standalone metric pill item ──

export interface MetricDimensionItem {
  type: "metric";
  slotIndex: number;
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
  entityIndex: number;
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
  textSize?: "xs" | "sm";
}

export function DimensionPillBar({
  items,
  textSize = "sm",
}: DimensionPillBarProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <Flex
      className={S.container}
      bg="background_page-primary"
      w="100%"
      align="center"
      justify="center"
      wrap="wrap"
      data-testid="metrics-viewer-dimension-pill-bar"
    >
      {items.map((item) => (
        <DimensionLabel
          key={
            item.type === "expression"
              ? `expr-${item.entityIndex}`
              : item.slotIndex
          }
          label={item.label}
          icon={item.icon}
          colors={item.colors}
          textSize={textSize}
        />
      ))}
    </Flex>
  );
}

function DimensionLabel({
  label,
  icon,
  colors,
  textSize,
}: {
  label?: string;
  icon?: IconName;
  colors?: string[];
  textSize: "xs" | "sm";
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
      <Text size={textSize} lh="1rem" c="text-primary">
        {label}
      </Text>
    </Flex>
  );
}
