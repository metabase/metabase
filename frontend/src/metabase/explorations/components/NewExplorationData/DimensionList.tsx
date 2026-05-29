import { useDraggable } from "@dnd-kit/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import cx from "classnames";
import { useCallback, useMemo, useRef } from "react";
import { t } from "ttag";

import {
  type ToggleDimensionContext,
  paletteDimensionDragId,
} from "metabase/explorations/hooks";
import { Box, Checkbox, Stack, Text, UnstyledButton } from "metabase/ui";
import type { DimensionId, MetricDimension } from "metabase-types/api";

import S from "./ItemList.module.css";
import { groupDimensionsByGroupSource } from "./utils";

const DIMENSION_CARD_HEIGHT = 70;
const DIMENSION_CARD_GAP = 8;

interface DimensionListProps {
  dimensions: MetricDimension[];
  isSelected: (dimensionId: DimensionId) => boolean;
  onToggle: (dimension: MetricDimension) => void;
  /**
   * Resolves the toggle context for a given dimension row. Threaded
   * into each row's drag payload so a drop on the Research plan's
   * empty-state target can build a dimension block with its group
   * siblings + referencing metrics hydrated — matching the
   * `selection.toggleDimension` checkbox path exactly.
   */
  getDragContext: (dimension: MetricDimension) => ToggleDimensionContext;
}

/**
 * Virtualized list of dimension rows — wide cards with a checkbox,
 * title and optional source name, matching `MetricList`. Rendered by
 * the Browse → Dimensions panel.
 */
export function DimensionList({
  dimensions,
  isSelected,
  onToggle,
  getDragContext,
}: DimensionListProps) {
  const rows = useMemo(
    () => groupDimensionsByGroupSource(dimensions),
    [dimensions],
  );

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: useCallback(() => parentRef.current, []),
    estimateSize: useCallback(() => DIMENSION_CARD_HEIGHT, []),
    measureElement: useCallback(
      (el: Element | null) =>
        (el?.getBoundingClientRect().height ?? DIMENSION_CARD_HEIGHT) +
        DIMENSION_CARD_GAP,
      [],
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
                data-interestingness={row.maxInterestingness || "null"}
              >
                {row.label}
              </Text>
            );
          }

          const dimension = row.dimension;
          return (
            <DraggableDimensionRow
              key={virtualRow.key}
              dimension={dimension}
              isSelected={isSelected(dimension.id)}
              top={virtualRow.start}
              measureRef={virtualizer.measureElement}
              dataIndex={virtualRow.index}
              onToggle={onToggle}
              dragContext={getDragContext(dimension)}
            />
          );
        })}
      </Box>
    </Box>
  );
}

interface DraggableDimensionRowProps {
  dimension: MetricDimension;
  isSelected: boolean;
  top: number;
  measureRef: (el: Element | null) => void;
  dataIndex: number;
  onToggle: (dimension: MetricDimension) => void;
  dragContext: ToggleDimensionContext;
}

function DraggableDimensionRow({
  dimension,
  isSelected,
  top,
  measureRef,
  dataIndex,
  onToggle,
  dragContext,
}: DraggableDimensionRowProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: paletteDimensionDragId(dimension.id),
    data: {
      kind: "dimension" as const,
      payload: dimension,
      context: dragContext,
    },
  });

  const composedRef = useCallback(
    (el: HTMLButtonElement | null) => {
      setNodeRef(el);
      measureRef(el);
    },
    [setNodeRef, measureRef],
  );

  return (
    <UnstyledButton
      ref={composedRef}
      {...attributes}
      {...listeners}
      role="listitem"
      data-index={dataIndex}
      aria-pressed={isSelected}
      data-interestingness={dimension.dimension_interestingness || "null"}
      className={cx(S.metricItem, {
        [S.metricItemSelected]: isSelected,
        [S.metricItemDragging]: isDragging,
      })}
      style={{
        transform: `translateY(${top}px)`,
      }}
      onClick={() => onToggle(dimension)}
    >
      <Checkbox
        checked={isSelected}
        onChange={() => onToggle(dimension)}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        aria-label={dimension.display_name}
      />
      {/* No secondary source line: the section header above the row
          already labels the source/table, so the row only needs the
          field name. */}
      <Stack gap="xs" flex={1}>
        <Text fw="bold" lh="1.25" lineClamp={1}>
          {dimension.display_name}
        </Text>
      </Stack>
    </UnstyledButton>
  );
}
