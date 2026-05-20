import { useMemo, useState } from "react";
import { t } from "ttag";

import { useGetExplorationDataQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import type { ExplorationSelection } from "metabase/explorations/hooks";
import type { ExplorationMetric } from "metabase/explorations/types";
import { Box, Icon, Stack, TextInput } from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
import type { DimensionId, MetricDimension } from "metabase-types/api";

import { MetricList } from "../NewExplorationData/MetricList";

import S from "./NewExplorationLeftTabs.module.css";

export interface BrowseMetricsPanelProps {
  selection: ExplorationSelection;
}

/**
 * Browse → Metrics tab. Search input + virtualized list; each click
 * commits to `selection.toggleMetric` immediately.
 */
export function BrowseMetricsPanel({ selection }: BrowseMetricsPanelProps) {
  const { metrics: selectedMetrics, toggleMetric } = selection;

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_DURATION);

  const {
    data: response,
    isFetching,
    error,
  } = useGetExplorationDataQuery({
    q: debouncedSearch.trim() || undefined,
  });

  const visibleMetrics: ExplorationMetric[] = useMemo(
    () => response?.metrics ?? [],
    [response],
  );

  // The toggle helper needs every dimension across every group so it
  // can attach the metric's "interesting" dimensions when the user
  // selects it.
  const dimensionsById = useMemo(() => {
    const map = new Map<DimensionId, MetricDimension>();
    for (const group of response?.dimension_groups ?? []) {
      for (const d of group.dimensions) {
        map.set(d.id, d);
      }
    }
    return map;
  }, [response]);

  const selectedIds = useMemo(
    () => new Set(selectedMetrics.map((m) => m.id)),
    [selectedMetrics],
  );

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
            onToggle={(metric) => toggleMetric(metric, { dimensionsById })}
          />
        </LoadingAndErrorWrapper>
      </Box>
    </Stack>
  );
}
