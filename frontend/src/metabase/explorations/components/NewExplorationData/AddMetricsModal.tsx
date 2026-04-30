import { useVirtualizer } from "@tanstack/react-virtual";
import cx from "classnames";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { useGetExplorationDataQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import type {
  ExplorationMetric,
  MetricDimension,
} from "metabase/explorations/types";
import {
  groupDimensionsBySemanticType,
  isLibraryMetric,
} from "metabase/explorations/utils";
import {
  Box,
  Button,
  Checkbox,
  Flex,
  Icon,
  Modal,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
import type {
  ExplorationMetric as ApiExplorationMetric,
  DimensionId,
  MetricBaseData,
} from "metabase-types/api";

import S from "./AddMetricsModal.module.css";

type MetricWithCollection = ExplorationMetric & {
  collection?: MetricBaseData["collection"];
};

const METRIC_ITEM_HEIGHT = 70;
const METRIC_ITEM_GAP = 8;
const DIMENSION_ITEM_HEIGHT = 36;
const DIMENSION_ITEM_GAP = 4;

export interface AddMetricsModalProps {
  opened: boolean;
  onClose: () => void;
  selectedMetrics: ExplorationMetric[];
  selectedDimensions: MetricDimension[];
  onSelectedItemsChange: (
    newMetrics: ExplorationMetric[],
    newDimensions: MetricDimension[],
  ) => void;
}

function toMetricWithCollection(
  metric: ApiExplorationMetric,
  dimensionsById: Map<DimensionId, MetricDimension>,
): MetricWithCollection {
  const resolved: MetricDimension[] = [];
  for (const id of metric.dimension_ids) {
    const dim = dimensionsById.get(id);
    if (dim) {
      resolved.push(dim);
    }
  }
  // Strip dimension_ids from the API shape and attach resolved dimensions so
  // the rest of the modal can keep working with `ExplorationMetric` (= Metric).
  const { dimension_ids: _ignored, ...rest } = metric;
  return { ...rest, dimensions: resolved } as MetricWithCollection;
}

export function AddMetricsModal({
  opened,
  onClose,
  selectedMetrics,
  selectedDimensions,
  onSelectedItemsChange,
}: AddMetricsModalProps) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_DURATION);

  const {
    data: response,
    isFetching,
    error,
  } = useGetExplorationDataQuery(
    { q: debouncedSearch.trim() || undefined },
    { skip: !opened },
  );

  const visibleDimensions = useMemo<MetricDimension[]>(
    () => response?.dimensions ?? [],
    [response],
  );

  const dimensionsById = useMemo(() => {
    const map = new Map<DimensionId, MetricDimension>();
    for (const d of visibleDimensions) {
      map.set(d.id, d);
    }
    return map;
  }, [visibleDimensions]);

  const rawMetrics = useMemo<MetricWithCollection[]>(
    () =>
      (response?.metrics ?? []).map((m) =>
        toMetricWithCollection(m, dimensionsById),
      ),
    [response, dimensionsById],
  );

  // Draft selection — committed to the parent only on Done.
  const [draftMetrics, setDraftMetrics] =
    useState<ExplorationMetric[]>(selectedMetrics);
  const [draftDimensions, setDraftDimensions] =
    useState<MetricDimension[]>(selectedDimensions);

  // Reset the draft from props whenever the modal opens.
  useEffect(() => {
    if (opened) {
      setDraftMetrics(selectedMetrics);
      setDraftDimensions(selectedDimensions);
      setSearch("");
    }
    // We intentionally only re-seed on `opened` transitions, not on every
    // parent change, so the user's in-flight edits aren't clobbered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  const handleDone = useCallback(() => {
    onSelectedItemsChange(draftMetrics, draftDimensions);
    onClose();
  }, [draftMetrics, draftDimensions, onSelectedItemsChange, onClose]);

  const visibleMetrics = useMemo(
    () =>
      [...rawMetrics].sort((a, b) => {
        const aLib = isLibraryMetric(a);
        const bLib = isLibraryMetric(b);
        if (aLib === bLib) {
          return 0;
        }
        return aLib ? -1 : 1;
      }),
    [rawMetrics],
  );

  const selectedMetricIds = useMemo(
    () => new Set(draftMetrics.map((m) => m.id)),
    [draftMetrics],
  );

  const selectedDimensionIds = useMemo(
    () => new Set(draftDimensions.map((d) => d.id)),
    [draftDimensions],
  );

  const metricsByDimension = useMemo(() => {
    const map = new Map<DimensionId, ExplorationMetric[]>();
    for (const metric of visibleMetrics) {
      for (const dimension of metric.dimensions) {
        const list = map.get(dimension.id);
        if (list) {
          list.push(metric);
        } else {
          map.set(dimension.id, [metric]);
        }
      }
    }
    return map;
  }, [visibleMetrics]);

  const toggleMetric = useCallback(
    (metric: ExplorationMetric) => {
      if (selectedMetricIds.has(metric.id)) {
        const nextMetrics = draftMetrics.filter((m) => m.id !== metric.id);
        setDraftMetrics(nextMetrics);
        const stillUsedDimIds = new Set<DimensionId>();
        for (const m of nextMetrics) {
          for (const d of m.dimensions) {
            stillUsedDimIds.add(d.id);
          }
        }
        const removedDimIds = new Set(metric.dimensions.map((d) => d.id));
        const nextDimensions = draftDimensions.filter(
          (d) => !removedDimIds.has(d.id) || stillUsedDimIds.has(d.id),
        );
        if (nextDimensions.length !== draftDimensions.length) {
          setDraftDimensions(nextDimensions);
        }
      } else {
        setDraftMetrics([...draftMetrics, metric]);
        const have = new Set(draftDimensions.map((d) => d.id));
        const merged = [...draftDimensions];
        for (const dimension of metric.dimensions) {
          if (!have.has(dimension.id)) {
            merged.push(dimension);
          }
        }
        if (merged.length !== draftDimensions.length) {
          setDraftDimensions(merged);
        }
      }
    },
    [draftDimensions, draftMetrics, selectedMetricIds],
  );

  const isDimensionSelected = useCallback(
    (dimensionId: DimensionId) => selectedDimensionIds.has(dimensionId),
    [selectedDimensionIds],
  );

  const toggleDimension = useCallback(
    (dimension: MetricDimension) => {
      const connected = metricsByDimension.get(dimension.id) ?? [];
      if (selectedDimensionIds.has(dimension.id)) {
        const nextDimensions = draftDimensions.filter(
          (d) => d.id !== dimension.id,
        );
        setDraftDimensions(nextDimensions);
        const remainingDimIds = new Set(nextDimensions.map((d) => d.id));
        // Only drop a connected metric if none of its dimensions are still selected.
        const orphanedIds = new Set(
          connected
            .filter((m) => !m.dimensions.some((d) => remainingDimIds.has(d.id)))
            .map((m) => m.id),
        );
        if (orphanedIds.size > 0) {
          setDraftMetrics(draftMetrics.filter((m) => !orphanedIds.has(m.id)));
        }
      } else {
        setDraftDimensions([...draftDimensions, dimension]);
        if (connected.length > 0) {
          const have = new Set(draftMetrics.map((m) => m.id));
          const merged = [...draftMetrics];
          for (const metric of connected) {
            if (!have.has(metric.id)) {
              merged.push(metric);
            }
          }
          if (merged.length !== draftMetrics.length) {
            setDraftMetrics(merged);
          }
        }
      }
    },
    [draftDimensions, draftMetrics, metricsByDimension, selectedDimensionIds],
  );

  return (
    <Modal.Root opened={opened} onClose={onClose} size="60rem" padding="xl">
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>{t`Exploration data`}</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body>
          <Box my="md">
            <TextInput
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              placeholder={t`Search for metrics or dimensions`}
              leftSection={<Icon name="search" />}
            />
          </Box>
          <LoadingAndErrorWrapper
            loading={isFetching}
            error={error}
            style={{
              height: "28rem",
            }}
          >
            <Flex gap="lg" h="28rem">
              <Stack flex={1} gap="sm" mih={0}>
                <Text fw="bold">{t`Metrics`}</Text>
                <MetricList
                  metrics={visibleMetrics}
                  selectedIds={selectedMetricIds}
                  onToggle={toggleMetric}
                />
              </Stack>
              <Stack w="18rem" gap="sm" mih={0}>
                <Text fw="bold">{t`Dimensions`}</Text>
                <DimensionList
                  className={S.dimensionsSection}
                  dimensions={visibleDimensions}
                  isSelected={isDimensionSelected}
                  onToggle={toggleDimension}
                />
              </Stack>
            </Flex>
          </LoadingAndErrorWrapper>
          <Flex justify="flex-end" mt="lg">
            <Button variant="filled" onClick={handleDone}>{t`Done`}</Button>
          </Flex>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}

interface MetricListProps {
  metrics: ExplorationMetric[];
  selectedIds: Set<ExplorationMetric["id"]>;
  onToggle: (metric: ExplorationMetric) => void;
}

function MetricList({ metrics, selectedIds, onToggle }: MetricListProps) {
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

interface DimensionListProps {
  dimensions: MetricDimension[];
  isSelected: (dimensionId: DimensionId) => boolean;
  onToggle: (dimension: MetricDimension) => void;
  className?: string;
}

function DimensionList({
  dimensions,
  isSelected,
  onToggle,
  className,
}: DimensionListProps) {
  const rows = useMemo(
    () => groupDimensionsBySemanticType(dimensions),
    [dimensions],
  );

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: useCallback(() => parentRef.current, []),
    estimateSize: useCallback(() => DIMENSION_ITEM_HEIGHT, []),
    measureElement: useCallback(
      (el: Element | null) =>
        (el?.getBoundingClientRect().height ?? DIMENSION_ITEM_HEIGHT) +
        DIMENSION_ITEM_GAP,
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
