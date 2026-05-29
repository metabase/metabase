import { useMemo, useState } from "react";
import { t } from "ttag";

import { useGetExplorationDataQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import type {
  ExplorationNavigation,
  ExplorationSelection,
} from "metabase/explorations/hooks";
import { isDimensionBlock } from "metabase/explorations/hooks";
import type { ExplorationMetric } from "metabase/explorations/types";
import { Box, Icon, Stack, TextInput } from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
import type { DimensionId, MetricDimension } from "metabase-types/api";

import { MetricList } from "../NewExplorationData/MetricList";

import S from "./NewExplorationLeftTabs.module.css";

export interface BrowseMetricsPanelProps {
  selection: ExplorationSelection;
  navigation: ExplorationNavigation;
}

export function BrowseMetricsPanel({
  selection,
  navigation,
}: BrowseMetricsPanelProps) {
  const {
    metricBlockIds,
    toggleMetric,
    blocks,
    addMetricToDimensionBlock,
    removeMetricFromDimensionBlock,
  } = selection;

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_DURATION);

  const {
    data: response,
    isFetching,
    error,
  } = useGetExplorationDataQuery({
    q: debouncedSearch.trim() || undefined,
  });

  const dimensionsById = useMemo(() => {
    const map = new Map<DimensionId, MetricDimension>();
    for (const group of response?.dimension_groups ?? []) {
      for (const d of group.dimensions) {
        map.set(d.id, d);
      }
    }
    return map;
  }, [response]);

  const activeDimensionBlock = useMemo(() => {
    if (navigation.activeBlockId == null) {
      return null;
    }
    const block = blocks.find((b) => b.id === navigation.activeBlockId);
    return block && isDimensionBlock(block) ? block : null;
  }, [navigation.activeBlockId, blocks]);

  const allMetrics: ExplorationMetric[] = useMemo(
    () => response?.metrics ?? [],
    [response],
  );

  const visibleMetrics = useMemo(() => {
    if (activeDimensionBlock == null) {
      return allMetrics;
    }
    const blockDimIds = new Set(
      activeDimensionBlock.groupDimensions.map((d) => d.id),
    );
    return allMetrics.filter((m) =>
      m.dimension_ids.some((id) => blockDimIds.has(id)),
    );
  }, [allMetrics, activeDimensionBlock]);

  const selectedIds = useMemo(() => {
    if (activeDimensionBlock == null) {
      return metricBlockIds;
    }
    return new Set(activeDimensionBlock.metrics.map((m) => m.id));
  }, [activeDimensionBlock, metricBlockIds]);

  return (
    <Stack className={S.browsePanel} data-testid="browse-panel">
      <TextInput
        className={S.browseSearch}
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
        placeholder={t`Search for a metric`}
        leftSection={<Icon name="search" />}
      />
      <Box className={S.browseList}>
        <LoadingAndErrorWrapper
          loading={isFetching}
          error={error}
          style={{ height: "100%" }}
        >
          <MetricList
            metrics={visibleMetrics}
            selectedIds={selectedIds}
            onToggle={(metric) => {
              if (activeDimensionBlock != null) {
                if (selectedIds.has(metric.id)) {
                  removeMetricFromDimensionBlock(
                    activeDimensionBlock.id,
                    metric.id,
                  );
                } else {
                  addMetricToDimensionBlock(activeDimensionBlock.id, metric);
                }
              } else {
                toggleMetric(metric, { dimensionsById });
              }
            }}
            dragContext={{ dimensionsById }}
          />
        </LoadingAndErrorWrapper>
      </Box>
    </Stack>
  );
}
