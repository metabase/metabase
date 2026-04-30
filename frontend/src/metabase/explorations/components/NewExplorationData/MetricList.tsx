import { useVirtualizer } from "@tanstack/react-virtual";
import cx from "classnames";
import { useCallback, useRef } from "react";
import { t } from "ttag";

import type { ExplorationMetric } from "metabase/explorations/types";
import { Box, Checkbox, Stack, Text, UnstyledButton } from "metabase/ui";

import S from "./AddMetricsModal.module.css";

const METRIC_ITEM_HEIGHT = 70;
const METRIC_ITEM_GAP = 8;

interface MetricListProps {
  metrics: ExplorationMetric[];
  selectedIds: Set<ExplorationMetric["id"]>;
  onToggle: (metric: ExplorationMetric) => void;
}

export function MetricList({
  metrics,
  selectedIds,
  onToggle,
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
          const isSelected = selectedIds.has(metric.id);
          return (
            <UnstyledButton
              key={virtualRow.key}
              role="listitem"
              aria-pressed={isSelected}
              className={cx(S.metricItem, {
                [S.metricItemSelected]: isSelected,
              })}
              style={{
                height: virtualRow.size - METRIC_ITEM_GAP,
                transform: `translateY(${virtualRow.start}px)`,
              }}
              onClick={() => onToggle(metric)}
            >
              <Checkbox
                checked={isSelected}
                onChange={() => onToggle(metric)}
                onClick={(event) => event.stopPropagation()}
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
        })}
      </Box>
    </Box>
  );
}
