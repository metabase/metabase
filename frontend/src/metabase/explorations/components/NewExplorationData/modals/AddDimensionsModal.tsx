import { useMemo, useState } from "react";
import { t } from "ttag";

import { useGetExplorationDataQuery } from "metabase/api";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { trackExplorationPlanEdited } from "metabase/explorations/analytics";
import type { ExplorationSelection } from "metabase/explorations/hooks";
import { Tabs } from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
import type {
  DimensionId,
  ExplorationDimensionGroup,
  ExplorationMetric,
} from "metabase-types/api";

import {
  DIMENSION_TYPE_ORDER,
  filterDimensionGroupsBySearch,
  getDimensionTypeKey,
  getDimensionTypeLabel,
} from "../utils";

import {
  AddEntitiesModal,
  type AddEntitiesModalItem,
} from "./AddEntitiesModal";

const ALL_TAB = "all";

export interface AddDimensionsModalProps {
  opened: boolean;
  onClose: () => void;
  selection: ExplorationSelection;
}

function groupTypeKey(group: ExplorationDimensionGroup) {
  return getDimensionTypeKey(group.dimensions[0]);
}

export function AddDimensionsModal({
  opened,
  onClose,
  selection,
}: AddDimensionsModalProps) {
  const { addDimension, dimensionBlockIds } = selection;

  const [tab, setTab] = useState<string>(ALL_TAB);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_DURATION);

  const {
    data: response,
    isFetching,
    error,
  } = useGetExplorationDataQuery({
    q: debouncedSearch.trim() || undefined,
  });

  const groups = useMemo(
    () =>
      filterDimensionGroupsBySearch(
        response?.dimension_groups ?? [],
        debouncedSearch,
      ).filter((group) => !dimensionBlockIds.has(group.dimensions[0].id)),
    [response, debouncedSearch, dimensionBlockIds],
  );

  const groupByHeadId = useMemo(() => {
    const map = new Map<DimensionId, ExplorationDimensionGroup>();
    for (const group of groups) {
      map.set(group.dimensions[0].id, group);
    }
    return map;
  }, [groups]);

  const metricsByDimension = useMemo(() => {
    const map = new Map<DimensionId, ExplorationMetric[]>();
    for (const metric of response?.metrics ?? []) {
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
  }, [response]);

  const presentTypes = useMemo(() => {
    const present = new Set(groups.map(groupTypeKey));
    return DIMENSION_TYPE_ORDER.filter((key) => present.has(key));
  }, [groups]);
  const showTabs = presentTypes.length > 1;
  const activeTab =
    showTabs && presentTypes.some((key) => key === tab) ? tab : ALL_TAB;

  const items = useMemo<AddEntitiesModalItem[]>(() => {
    const visible =
      activeTab === ALL_TAB
        ? groups
        : groups.filter((group) => groupTypeKey(group) === activeTab);
    return [...visible]
      .sort(
        (a, b) =>
          (b.dimension_interestingness ?? 0) -
          (a.dimension_interestingness ?? 0),
      )
      .map((group) => ({
        key: group.dimensions[0].id,
        label: group.name,
        interestingness: group.dimension_interestingness,
      }));
  }, [groups, activeTab]);

  const handleAdd = (keys: string[]) => {
    trackExplorationPlanEdited("manual", "dimensions");
    for (const key of keys) {
      const group = groupByHeadId.get(key);
      if (group) {
        addDimension(group.dimensions[0], { group, metricsByDimension });
      }
    }
  };

  const tabs = showTabs ? (
    <Tabs value={activeTab} onChange={(value) => value && setTab(value)}>
      <Tabs.List>
        <Tabs.Tab value={ALL_TAB} px="md">{t`All`}</Tabs.Tab>
        {presentTypes.map((key) => (
          <Tabs.Tab key={key} value={key} px="md">
            {getDimensionTypeLabel(key)}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs>
  ) : undefined;

  return (
    <AddEntitiesModal
      opened={opened}
      onClose={onClose}
      title={t`Add dimensions of interest to your research plan`}
      searchPlaceholder={t`Search for a dimension`}
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
