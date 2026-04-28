import { useVirtualizer } from "@tanstack/react-virtual";
import cx from "classnames";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { metricApi, useListMetricsQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import type {
  MetricDimension,
  MetricOrMeasure,
} from "metabase/explorations/types";
import { toMetricOrMeasure } from "metabase/explorations/utils";
import { useDispatch } from "metabase/redux";
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
import type { DimensionId, Metric } from "metabase-types/api";

import S from "./AddMetricsModal.module.css";

const METRIC_ITEM_HEIGHT = 72;
const METRIC_ITEM_GAP = 8;
const DIMENSION_ITEM_HEIGHT = 36;

export interface AddMetricsModalProps {
  opened: boolean;
  onClose: () => void;
  selectedMetrics: MetricOrMeasure[];
  selectedDimensions: MetricDimension[];
  onSelectedItemsChange: (
    newMetrics: MetricOrMeasure[],
    newDimensions: MetricDimension[],
  ) => void;
}

function dedupeDimensions(metrics: MetricOrMeasure[]): MetricDimension[] {
  const map = new Map<DimensionId, MetricDimension>();
  for (const metric of metrics) {
    for (const dimension of metric.dimensions ?? []) {
      if (!map.has(dimension.id)) {
        map.set(dimension.id, dimension);
      }
    }
  }
  return [...map.values()];
}

function useFullMetrics(opened: boolean) {
  const {
    data: response,
    isLoading: isListLoading,
    error: listError,
  } = useListMetricsQuery(undefined, { skip: !opened });
  const dispatch = useDispatch();
  const [items, setItems] = useState<Metric[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<unknown>(null);

  useEffect(() => {
    if (!opened) {
      return;
    }
    if (!response || response.data.length === 0) {
      setItems([]);
      return;
    }
    let cancelled = false;
    setIsLoadingDetails(true);
    setDetailsError(null);
    Promise.all(
      response.data.map((metric) =>
        dispatch(metricApi.endpoints.getMetric.initiate(metric.id)).unwrap(),
      ),
    )
      .then((results) => {
        if (!cancelled) {
          setItems(results);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setDetailsError(err);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingDetails(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [opened, dispatch, response]);

  return {
    metrics: items,
    isLoading: isListLoading || isLoadingDetails,
    error: listError ?? detailsError,
  };
}

export function AddMetricsModal({
  opened,
  onClose,
  selectedMetrics,
  selectedDimensions,
  onSelectedItemsChange,
}: AddMetricsModalProps) {
  const { metrics: rawMetrics, isLoading, error } = useFullMetrics(opened);

  const [search, setSearch] = useState("");

  // Draft selection — committed to the parent only on Done.
  const [draftMetrics, setDraftMetrics] =
    useState<MetricOrMeasure[]>(selectedMetrics);
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

  const allMetrics = useMemo(
    () => rawMetrics.map(toMetricOrMeasure),
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

  const filteredMetrics = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return allMetrics;
    }
    return allMetrics.filter(
      (metric) =>
        metric.name.toLowerCase().includes(query) ||
        metric.dimensions.some((dimension) =>
          dimension["display-name"].toLowerCase().includes(query),
        ),
    );
  }, [allMetrics, search]);

  const visibleDimensions = useMemo(
    () => dedupeDimensions(filteredMetrics),
    [filteredMetrics],
  );

  const metricsByDimension = useMemo(() => {
    const map = new Map<DimensionId, MetricOrMeasure[]>();
    for (const metric of allMetrics) {
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
  }, [allMetrics]);

  const toggleMetric = useCallback(
    (metric: MetricOrMeasure) => {
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
          <TextInput
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder={t`Search for metrics or dimensions`}
            leftSection={<Icon name="search" />}
            mb="md"
          />
          <LoadingAndErrorWrapper loading={isLoading} error={error}>
            <Flex gap="lg" h="28rem">
              <Stack flex={1} gap="sm" mih={0}>
                <Text fw="bold">{t`Metrics`}</Text>
                <MetricList
                  metrics={filteredMetrics}
                  selectedIds={selectedMetricIds}
                  onToggle={toggleMetric}
                />
              </Stack>
              <Stack w="18rem" gap="sm" mih={0}>
                <Text fw="bold">{t`Dimensions`}</Text>
                <DimensionList
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
  metrics: MetricOrMeasure[];
  selectedIds: Set<MetricOrMeasure["id"]>;
  onToggle: (metric: MetricOrMeasure) => void;
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
              <Stack gap={2} flex={1} mih={0}>
                <Text fw="bold" lh="1.25" lineClamp={1}>
                  {metric.name}
                </Text>
                {metric.description && (
                  <Text size="sm" c="text-secondary" lineClamp={1}>
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
}

function DimensionList({
  dimensions,
  isSelected,
  onToggle,
}: DimensionListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: dimensions.length,
    getScrollElement: useCallback(() => parentRef.current, []),
    estimateSize: useCallback(() => DIMENSION_ITEM_HEIGHT, []),
    overscan: 5,
  });

  if (dimensions.length === 0) {
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
          const dimension = dimensions[virtualRow.index];
          const selected = isSelected(dimension.id);
          return (
            <UnstyledButton
              key={virtualRow.key}
              role="listitem"
              aria-pressed={selected}
              className={cx(S.dimensionChip, {
                [S.dimensionChipSelected]: selected,
              })}
              style={{
                width: "auto",
                transform: `translateY(${virtualRow.start}px)`,
              }}
              onClick={() => onToggle(dimension)}
            >
              {dimension["display-name"]}
            </UnstyledButton>
          );
        })}
      </Box>
    </Box>
  );
}
