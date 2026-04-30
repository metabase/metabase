import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { useGetExplorationDataQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import type {
  ExplorationMetric,
  MetricDimension,
} from "metabase/explorations/types";
import {
  Box,
  Button,
  Flex,
  Icon,
  Modal,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
import type {
  ExplorationMetric as ApiExplorationMetric,
  DimensionId,
  ExplorationDimensionGroup,
  MetricBaseData,
} from "metabase-types/api";

import S from "./AddMetricsModal.module.css";
import { DimensionList } from "./DimensionList";
import { MetricList } from "./MetricList";
import { isLibraryMetric } from "./utils";

type MetricWithCollection = ExplorationMetric & {
  collection?: MetricBaseData["collection"];
};

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
  selectedMetrics: initialMetrics,
  selectedDimensions: initialDimensions,
  onSelectedItemsChange,
}: AddMetricsModalProps) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_DURATION);

  const [selectedMetrics, setSelectedMetrics] =
    useState<ExplorationMetric[]>(initialMetrics);
  const [selectedDimensions, setSelectedDimensions] =
    useState<MetricDimension[]>(initialDimensions);

  const selectedMetricIds = useMemo(
    () => new Set(selectedMetrics.map((m) => m.id)),
    [selectedMetrics],
  );

  const selectedDimensionIds = useMemo(
    () => new Set(selectedDimensions.map((d) => d.id)),
    [selectedDimensions],
  );

  const {
    data: response,
    isFetching,
    error,
  } = useGetExplorationDataQuery(
    { q: debouncedSearch.trim() || undefined },
    { skip: !opened },
  );

  const visibleGroups = useMemo<ExplorationDimensionGroup[]>(
    () => response?.dimension_groups ?? [],
    [response],
  );

  const groupRows = useMemo<MetricDimension[]>(
    () =>
      visibleGroups.map((g) => {
        const head = g.dimensions[0];
        return {
          ...head,
          display_name: g.name,
          dimension_interestingness: g.dimension_interestingness,
          group: undefined,
        };
      }),
    [visibleGroups],
  );

  const { groupByRowId, dimensionsById } = useMemo(() => {
    const groupByRowId = new Map<DimensionId, ExplorationDimensionGroup>();
    const dimensionsById = new Map<DimensionId, MetricDimension>();
    visibleGroups.forEach((g, i) => {
      groupByRowId.set(groupRows[i].id, g);

      for (const d of g.dimensions) {
        dimensionsById.set(d.id, d);
      }
    });
    return { groupByRowId, dimensionsById };
  }, [groupRows, visibleGroups]);

  const rawMetrics = useMemo<MetricWithCollection[]>(
    () =>
      (response?.metrics ?? []).map((m) =>
        toMetricWithCollection(m, dimensionsById),
      ),
    [response, dimensionsById],
  );

  // Reset the draft from props whenever the modal opens.
  useEffect(() => {
    if (opened) {
      setSelectedMetrics(initialMetrics);
      setSelectedDimensions(initialDimensions);
      setSearch("");
    }
    // We intentionally only re-seed on `opened` transitions, not on every
    // parent change, so the user's in-flight edits aren't clobbered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  const handleDone = useCallback(() => {
    onSelectedItemsChange(selectedMetrics, selectedDimensions);
    onClose();
  }, [selectedMetrics, selectedDimensions, onSelectedItemsChange, onClose]);

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
        const nextMetrics = selectedMetrics.filter((m) => m.id !== metric.id);
        setSelectedMetrics(nextMetrics);
        const stillUsedDimIds = new Set<DimensionId>();
        for (const m of nextMetrics) {
          for (const d of m.dimensions) {
            stillUsedDimIds.add(d.id);
          }
        }
        const removedDimIds = new Set(metric.dimensions.map((d) => d.id));
        const nextDimensions = selectedDimensions.filter(
          (d) => !removedDimIds.has(d.id) || stillUsedDimIds.has(d.id),
        );
        if (nextDimensions.length !== selectedDimensions.length) {
          setSelectedDimensions(nextDimensions);
        }
      } else {
        setSelectedMetrics([...selectedMetrics, metric]);
        const have = new Set(selectedDimensions.map((d) => d.id));
        const merged = [...selectedDimensions];
        for (const dimension of metric.dimensions) {
          if (!have.has(dimension.id)) {
            merged.push(dimension);
          }
        }
        if (merged.length !== selectedDimensions.length) {
          setSelectedDimensions(merged);
        }
      }
    },
    [selectedDimensions, selectedMetrics, selectedMetricIds],
  );

  const isDimensionSelected = useCallback(
    (dimensionId: DimensionId) => {
      const group = groupByRowId.get(dimensionId);
      if (!group) {
        return selectedDimensionIds.has(dimensionId);
      }
      return group.dimensions.some((d) => selectedDimensionIds.has(d.id));
    },
    [groupByRowId, selectedDimensionIds],
  );

  const toggleDimension = useCallback(
    (dimension: MetricDimension) => {
      const group = groupByRowId.get(dimension.id);
      const groupDims = group ? group.dimensions : [dimension];
      const groupIds = new Set(groupDims.map((d) => d.id));
      const groupSelected = groupDims.some((d) =>
        selectedDimensionIds.has(d.id),
      );
      const connected = groupDims.flatMap(
        (d) => metricsByDimension.get(d.id) ?? [],
      );

      if (groupSelected) {
        const nextDimensions = selectedDimensions.filter(
          (d) => !groupIds.has(d.id),
        );
        setSelectedDimensions(nextDimensions);
        const remainingDimIds = new Set(nextDimensions.map((d) => d.id));
        const orphanedIds = new Set(
          connected
            .filter((m) => !m.dimensions.some((d) => remainingDimIds.has(d.id)))
            .map((m) => m.id),
        );
        if (orphanedIds.size > 0) {
          setSelectedMetrics(
            selectedMetrics.filter((m) => !orphanedIds.has(m.id)),
          );
        }
      } else {
        const have = new Set(selectedDimensions.map((d) => d.id));
        const mergedDims = [...selectedDimensions];
        for (const d of groupDims) {
          if (!have.has(d.id)) {
            mergedDims.push(d);
          }
        }
        if (mergedDims.length !== selectedDimensions.length) {
          setSelectedDimensions(mergedDims);
        }
        if (connected.length > 0) {
          const haveMetrics = new Set(selectedMetrics.map((m) => m.id));
          const mergedMetrics = [...selectedMetrics];
          for (const metric of connected) {
            if (!haveMetrics.has(metric.id)) {
              mergedMetrics.push(metric);
              haveMetrics.add(metric.id);
            }
          }
          if (mergedMetrics.length !== selectedMetrics.length) {
            setSelectedMetrics(mergedMetrics);
          }
        }
      }
    },
    [
      selectedDimensions,
      selectedMetrics,
      groupByRowId,
      metricsByDimension,
      selectedDimensionIds,
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
                  dimensions={groupRows}
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
