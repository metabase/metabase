import { useDraggable } from "@dnd-kit/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import cx from "classnames";
import { useCallback, useRef } from "react";
import { t } from "ttag";

import {
  type ToggleMetricContext,
  paletteMetricDragId,
} from "metabase/explorations/hooks";
import type { ExplorationMetric } from "metabase/explorations/types";
import { Box, Checkbox, Stack, Text, UnstyledButton } from "metabase/ui";

import S from "./ItemList.module.css";

const METRIC_ITEM_HEIGHT = 70;
const METRIC_ITEM_GAP = 8;

interface MetricListProps {
  metrics: ExplorationMetric[];
  selectedIds: Set<ExplorationMetric["id"]>;
  onToggle: (metric: ExplorationMetric) => void;
  dragContext: ToggleMetricContext;
}

export function MetricList({
  metrics,
  selectedIds,
  onToggle,
  dragContext,
}: MetricListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: metrics.length,
    getScrollElement: useCallback(() => parentRef.current, []),
    estimateSize: useCallback(() => METRIC_ITEM_HEIGHT + METRIC_ITEM_GAP, []),
    overscan: 5,
  });

  if (metrics.length === 0) {
    return (
      <Text c="text-secondary" py="md">
        {t`No metrics found`}
      </Text>
    );
  }

  return (
    <Box ref={parentRef} className={S.scrollContainer}>
      <Box
        role="list"
        style={{
          position: "relative",
          height: virtualizer.getTotalSize(),
          width: "100%",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const metric = metrics[virtualRow.index];
          return (
            <DraggableMetricRow
              key={virtualRow.key}
              metric={metric}
              isSelected={selectedIds.has(metric.id)}
              top={virtualRow.start}
              height={virtualRow.size - METRIC_ITEM_GAP}
              onToggle={onToggle}
              dragContext={dragContext}
            />
          );
        })}
      </Box>
    </Box>
  );
}

interface DraggableMetricRowProps {
  metric: ExplorationMetric;
  isSelected: boolean;
  top: number;
  height: number;
  onToggle: (metric: ExplorationMetric) => void;
  dragContext: ToggleMetricContext;
}

function DraggableMetricRow({
  metric,
  isSelected,
  top,
  height,
  onToggle,
  dragContext,
}: DraggableMetricRowProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: paletteMetricDragId(metric.id),
    data: {
      kind: "metric" as const,
      payload: metric,
      context: dragContext,
    },
  });

  return (
    <UnstyledButton
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="listitem"
      aria-pressed={isSelected}
      className={cx(S.metricItem, {
        [S.metricItemSelected]: isSelected,
        [S.metricItemDragging]: isDragging,
      })}
      style={{
        height,
        transform: `translateY(${top}px)`,
      }}
      onClick={() => onToggle(metric)}
    >
      <Checkbox
        checked={isSelected}
        onChange={() => onToggle(metric)}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        aria-label={metric.name}
      />
      <Stack gap="xs" flex={1}>
        <Text fw="bold" lh="1.25" lineClamp={1}>
          {metric.name}
        </Text>
        {metric.description && (
          <Text size="sm" lh="1rem" c="text-secondary" lineClamp={1}>
            {metric.description}
          </Text>
        )}
      </Stack>
    </UnstyledButton>
  );
}
