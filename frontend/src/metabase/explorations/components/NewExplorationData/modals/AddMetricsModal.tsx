import { useMemo, useState } from "react";
import { t } from "ttag";

import { useGetExplorationDataQuery } from "metabase/api";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { trackExplorationPlanEdited } from "metabase/explorations/analytics";
import type { ExplorationSelection } from "metabase/explorations/hooks";
import { PLUGIN_LIBRARY } from "metabase/plugins";
import { Icon, Tabs } from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
import type { DimensionId, MetricDimension } from "metabase-types/api";

import { AddEntitiesModal } from "./AddEntitiesModal";

export interface AddMetricsModalProps {
  opened: boolean;
  onClose: () => void;
  selection: ExplorationSelection;
}

type MetricsTab = "library" | "all";

export function AddMetricsModal({
  opened,
  onClose,
  selection,
}: AddMetricsModalProps) {
  const { addMetric, metricBlockIds } = selection;

  const libraryEnabled = PLUGIN_LIBRARY.isEnabled;
  const [tab, setTab] = useState<MetricsTab>(
    libraryEnabled ? "library" : "all",
  );

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
      for (const dimension of group.dimensions) {
        map.set(dimension.id, dimension);
      }
    }
    return map;
  }, [response]);

  const metrics = useMemo(
    () => (response?.metrics ?? []).filter((m) => !metricBlockIds.has(m.id)),
    [response, metricBlockIds],
  );
  const metricsById = useMemo(
    () => new Map(metrics.map((metric) => [metric.id, metric])),
    [metrics],
  );

  const visibleMetrics = useMemo(
    () =>
      libraryEnabled && tab === "library"
        ? metrics.filter((metric) => metric.in_library)
        : metrics,
    [libraryEnabled, tab, metrics],
  );

  const items = visibleMetrics.map((metric) => ({
    key: String(metric.id),
    label: metric.name,
    description: metric.description,
  }));

  const handleAdd = (keys: string[]) => {
    trackExplorationPlanEdited("manual", "metrics");
    for (const key of keys) {
      const metric = metricsById.get(Number(key));
      if (metric) {
        addMetric(metric, { dimensionsById });
      }
    }
  };

  const tabs = libraryEnabled ? (
    <Tabs
      value={tab}
      onChange={(value) => value && setTab(value as MetricsTab)}
    >
      <Tabs.List>
        <Tabs.Tab
          value="library"
          px="md"
          leftSection={<Icon name="repository" size={14} />}
        >{t`Library`}</Tabs.Tab>
        <Tabs.Tab value="all" px="md">{t`All`}</Tabs.Tab>
      </Tabs.List>
    </Tabs>
  ) : undefined;

  return (
    <AddEntitiesModal
      opened={opened}
      onClose={onClose}
      title={t`Add metrics to your research plan`}
      searchPlaceholder={t`Search for a metric`}
      search={search}
      onSearchChange={setSearch}
      items={items}
      isLoading={isFetching}
      error={error}
      onAdd={handleAdd}
      tabs={tabs}
    />
  );
}
