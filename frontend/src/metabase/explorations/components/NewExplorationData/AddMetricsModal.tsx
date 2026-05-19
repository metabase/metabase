import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { useGetExplorationDataQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import type { ExplorationSelection } from "metabase/explorations/hooks";
import type { ExplorationMetric } from "metabase/explorations/types";
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
  DimensionId,
  ExplorationDimensionGroup,
  MetricDimension,
} from "metabase-types/api";

import S from "./AddMetricsModal.module.css";
import { DimensionList } from "./DimensionList";
import { MetricList } from "./MetricList";

export interface AddMetricsModalProps {
  opened: boolean;
  onClose: () => void;
  selection: ExplorationSelection;
}

/**
 * Modal entry point for picking metrics + dimensions from the right
 * panel's "+" button. Each row toggles `selection` immediately — so the
 * right-panel pills update on every click and the bottom button just
 * closes. Selection rules (auto-add interesting dimensions, cascade
 * group-toggles, orphan-metric drop) live in `useExplorationSelection`
 * so the Browse tab and this modal share the same behaviour.
 */
export function AddMetricsModal({
  opened,
  onClose,
  selection,
}: AddMetricsModalProps) {
  const {
    metrics: selectedMetrics,
    dimensions: selectedDimensions,
    toggleMetric,
    toggleDimension,
  } = selection;

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_DURATION);

  // Clear the search input every time the modal re-opens so users land
  // on the full picker, not a stale filtered view.
  useEffect(() => {
    if (opened) {
      setSearch("");
    }
  }, [opened]);

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

  const visibleMetrics: ExplorationMetric[] = useMemo(
    () => response?.metrics ?? [],
    [response],
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

  const metricsByDimension = useMemo(() => {
    const map = new Map<DimensionId, ExplorationMetric[]>();
    for (const metric of visibleMetrics) {
      for (const id of metric.dimension_ids) {
        const list = map.get(id);
        if (list) {
          list.push(metric);
        } else {
          map.set(id, [metric]);
        }
      }
    }
    return map;
  }, [visibleMetrics]);

  const handleToggleMetric = (metric: ExplorationMetric) => {
    toggleMetric(metric, { dimensionsById });
  };

  const handleToggleDimension = (dimension: MetricDimension) => {
    const group = groupByRowId.get(dimension.id) ?? null;
    toggleDimension(dimension, { group, metricsByDimension });
  };

  const isDimensionSelected = (dimensionId: DimensionId) => {
    const group = groupByRowId.get(dimensionId);
    if (!group) {
      return selectedDimensionIds.has(dimensionId);
    }
    return group.dimensions.some((d) => selectedDimensionIds.has(d.id));
  };

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
                  onToggle={handleToggleMetric}
                />
              </Stack>
              <Stack w="18rem" gap="sm" mih={0}>
                <Text fw="bold">{t`Dimensions`}</Text>
                <DimensionList
                  className={S.dimensionsSection}
                  dimensions={groupRows}
                  isSelected={isDimensionSelected}
                  onToggle={handleToggleDimension}
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
