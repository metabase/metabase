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
  metrics: MetricOrMeasure[];
  setMetrics: (metrics: MetricOrMeasure[]) => void;
  dimensions: MetricDimension[];
  setDimensions: (dimensions: MetricDimension[]) => void;
}

function toMetricOrMeasure(metric: Metric): MetricOrMeasure {
  return {
    type: "metric",
    id: metric.id,
    name: metric.name,
    description: metric.description,
    dimensions: metric.dimensions ?? [],
    dimension_mappings: metric.dimension_mappings,
  };
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
  metrics,
  setMetrics,
  dimensions,
  setDimensions,
}: AddMetricsModalProps) {
  const { metrics: rawMetrics, isLoading, error } = useFullMetrics(opened);

  const [search, setSearch] = useState("");

  const allMetrics = useMemo(
    () => rawMetrics.map(toMetricOrMeasure),
    [rawMetrics],
  );

  const selectedMetricIds = useMemo(
    () => new Set(metrics.map((m) => m.id)),
    [metrics],
  );

  const selectedDimensionIds = useMemo(
    () => new Set(dimensions.map((d) => d.id)),
    [dimensions],
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
        const nextMetrics = metrics.filter((m) => m.id !== metric.id);
        setMetrics(nextMetrics);
        const stillUsedDimIds = new Set<DimensionId>();
        for (const m of nextMetrics) {
          for (const d of m.dimensions) {
            stillUsedDimIds.add(d.id);
          }
        }
        const removedDimIds = new Set(metric.dimensions.map((d) => d.id));
        const nextDimensions = dimensions.filter(
          (d) => !removedDimIds.has(d.id) || stillUsedDimIds.has(d.id),
        );
        if (nextDimensions.length !== dimensions.length) {
          setDimensions(nextDimensions);
        }
      } else {
        setMetrics([...metrics, metric]);
        const have = new Set(dimensions.map((d) => d.id));
        const merged = [...dimensions];
        for (const dimension of metric.dimensions) {
          if (!have.has(dimension.id)) {
            merged.push(dimension);
          }
        }
        if (merged.length !== dimensions.length) {
          setDimensions(merged);
        }
      }
    },
    [dimensions, metrics, selectedMetricIds, setDimensions, setMetrics],
  );

  const isDimensionSelected = useCallback(
    (dimensionId: DimensionId) => selectedDimensionIds.has(dimensionId),
    [selectedDimensionIds],
  );

  const toggleDimension = useCallback(
    (dimension: MetricDimension) => {
      const connected = metricsByDimension.get(dimension.id) ?? [];
      if (selectedDimensionIds.has(dimension.id)) {
        setDimensions(dimensions.filter((d) => d.id !== dimension.id));
        const removeIds = new Set(connected.map((m) => m.id));
        if (removeIds.size > 0) {
          setMetrics(metrics.filter((m) => !removeIds.has(m.id)));
        }
      } else {
        setDimensions([...dimensions, dimension]);
        if (connected.length > 0) {
          const have = new Set(metrics.map((m) => m.id));
          const merged = [...metrics];
          for (const metric of connected) {
            if (!have.has(metric.id)) {
              merged.push(metric);
            }
          }
          if (merged.length !== metrics.length) {
            setMetrics(merged);
          }
        }
      }
    },
    [
      dimensions,
      metrics,
      metricsByDimension,
      selectedDimensionIds,
      setDimensions,
      setMetrics,
    ],
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
            <Button variant="filled" onClick={onClose}>{t`Done`}</Button>
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
