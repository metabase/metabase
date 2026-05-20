import { useVirtualizer } from "@tanstack/react-virtual";
import cx from "classnames";
import { useCallback, useMemo, useRef } from "react";
import { t } from "ttag";

import { Box, Checkbox, Stack, Text, UnstyledButton } from "metabase/ui";
import type { DimensionId, MetricDimension } from "metabase-types/api";

import S from "./ItemList.module.css";
import { groupDimensionsBySemanticType } from "./utils";

const DIMENSION_CHIP_HEIGHT = 36;
const DIMENSION_CARD_HEIGHT = 70;
const DIMENSION_ITEM_GAP = 4;
const DIMENSION_CARD_GAP = 8;

/**
 * `chip` — compact pill rows.
 * `card` — wide rows with a checkbox, title and optional description,
 * matching `MetricList`. Used by the Browse → Dimensions panel.
 */
type DimensionListVariant = "chip" | "card";

interface DimensionListProps {
  dimensions: MetricDimension[];
  isSelected: (dimensionId: DimensionId) => boolean;
  onToggle: (dimension: MetricDimension) => void;
  variant?: DimensionListVariant;
  className?: string;
}

export function DimensionList({
  dimensions,
  isSelected,
  onToggle,
  variant = "chip",
  className,
}: DimensionListProps) {
  const rows = useMemo(
    () => groupDimensionsBySemanticType(dimensions),
    [dimensions],
  );

  const baseHeight =
    variant === "card" ? DIMENSION_CARD_HEIGHT : DIMENSION_CHIP_HEIGHT;
  const gap = variant === "card" ? DIMENSION_CARD_GAP : DIMENSION_ITEM_GAP;

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: useCallback(() => parentRef.current, []),
    estimateSize: useCallback(() => baseHeight, [baseHeight]),
    measureElement: useCallback(
      (el: Element | null) =>
        (el?.getBoundingClientRect().height ?? baseHeight) + gap,
      [baseHeight, gap],
    ),
    overscan: 5,
  });

  if (rows.length === 0) {
    return (
      <Text c="text-secondary" py="md">
        {t`No dimensions available`}
      </Text>
    );
  }

  return (
    <Box ref={parentRef} className={cx(className, S.scrollContainer)}>
      <Box
        role="list"
        style={{
          position: "relative",
          height: virtualizer.getTotalSize(),
          width: "100%",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];

          if (row.type === "header") {
            return (
              <Text
                key={virtualRow.key}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                fw="bold"
                size="sm"
                c="text-secondary"
                lh="1rem"
                className={S.dimensionGroupHeader}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                data-interestingness={row.averageInterestingness || "null"}
              >
                {row.label}
              </Text>
            );
          }

          const dimension = row.dimension;
          const selected = isSelected(dimension.id);
          const sourceName = dimension.group?.display_name;

          if (variant === "card") {
            return (
              <UnstyledButton
                key={virtualRow.key}
                ref={virtualizer.measureElement}
                role="listitem"
                data-index={virtualRow.index}
                aria-pressed={selected}
                data-interestingness={
                  dimension.dimension_interestingness || "null"
                }
                className={cx(S.metricItem, {
                  [S.metricItemSelected]: selected,
                })}
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                onClick={() => onToggle(dimension)}
              >
                <Checkbox
                  checked={selected}
                  onChange={() => onToggle(dimension)}
                  onClick={(event) => event.stopPropagation()}
                  aria-label={dimension.display_name}
                />
                <Stack gap="xs" flex={1}>
                  <Text fw="bold" lh="1.25" lineClamp={1}>
                    {dimension.display_name}
                  </Text>
                  {sourceName && (
                    <Text size="sm" lh="1rem" c="text-secondary" lineClamp={1}>
                      {sourceName}
                    </Text>
                  )}
                </Stack>
              </UnstyledButton>
            );
          }

          return (
            <UnstyledButton
              key={virtualRow.key}
              ref={virtualizer.measureElement}
              role="listitem"
              data-index={virtualRow.index}
              aria-pressed={selected}
              data-interestingness={
                dimension.dimension_interestingness || "null"
              }
              className={cx(S.dimensionChip, {
                [S.dimensionChipSelected]: selected,
              })}
              style={{
                width: "auto",
                transform: `translateY(${virtualRow.start}px)`,
              }}
              onClick={() => onToggle(dimension)}
            >
              {sourceName && sourceName + " - "}
              {dimension.display_name}
            </UnstyledButton>
          );
        })}
      </Box>
    </Box>
  );
}
