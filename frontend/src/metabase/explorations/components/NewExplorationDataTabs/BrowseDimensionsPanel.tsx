import { useMemo, useState } from "react";
import { t } from "ttag";

import { useGetExplorationDataQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { trackExplorationPlanEdited } from "metabase/explorations/analytics";
import type {
  ExplorationNavigation,
  ExplorationSelection,
} from "metabase/explorations/hooks";
import { isMetricBlock } from "metabase/explorations/hooks";
import type { ExplorationMetric } from "metabase/explorations/types";
import { Box, Icon, Stack, TextInput } from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
import type {
  DimensionId,
  ExplorationDimensionGroup,
  MetricDimension,
} from "metabase-types/api";

import { DimensionList } from "../NewExplorationData/DimensionList";
import { filterDimensionGroupsBySearch } from "../NewExplorationData/utils";

import S from "./NewExplorationLeftTabs.module.css";

export interface BrowseDimensionsPanelProps {
  selection: ExplorationSelection;
  navigation: ExplorationNavigation;
}

export function BrowseDimensionsPanel({
  selection,
  navigation,
}: BrowseDimensionsPanelProps) {
  const {
    dimensionBlockIds,
    toggleDimension,
    blocks,
    addDimensionToMetricBlock,
    removeDimensionFromMetricBlock,
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

  const activeMetricBlock = useMemo(() => {
    if (navigation.activeBlockId == null) {
      return null;
    }
    const block = blocks.find((b) => b.id === navigation.activeBlockId);
    return block && isMetricBlock(block) ? block : null;
  }, [navigation.activeBlockId, blocks]);

  const allGroups = useMemo<ExplorationDimensionGroup[]>(
    () =>
      filterDimensionGroupsBySearch(
        response?.dimension_groups ?? [],
        debouncedSearch,
      ),
    [response, debouncedSearch],
  );

  const visibleGroups = useMemo(() => {
    if (activeMetricBlock == null) {
      return allGroups;
    }
    const metricDimIds = new Set(activeMetricBlock.metric.dimension_ids);
    return allGroups.filter((g) =>
      g.dimensions.some((d) => metricDimIds.has(d.id)),
    );
  }, [allGroups, activeMetricBlock]);

  const groupRows = useMemo<MetricDimension[]>(
    () =>
      visibleGroups.map((g) => ({
        ...g.dimensions[0],
        dimension_interestingness: g.dimension_interestingness,
      })),
    [visibleGroups],
  );

  const groupByRowId = useMemo(() => {
    const map = new Map<DimensionId, ExplorationDimensionGroup>();
    visibleGroups.forEach((g, i) => {
      map.set(groupRows[i].id, g);
    });
    return map;
  }, [groupRows, visibleGroups]);

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

  const blockSelectedDimIds = useMemo(() => {
    if (activeMetricBlock == null) {
      return null;
    }
    return new Set(activeMetricBlock.dimensions.map((d) => d.id));
  }, [activeMetricBlock]);

  const isSelected = (dimensionId: DimensionId) => {
    if (blockSelectedDimIds != null) {
      const group = groupByRowId.get(dimensionId);
      if (!group) {
        return blockSelectedDimIds.has(dimensionId);
      }
      return group.dimensions.some((d) => blockSelectedDimIds.has(d.id));
    }
    const group = groupByRowId.get(dimensionId);
    if (!group) {
      return dimensionBlockIds.has(dimensionId);
    }
    return group.dimensions.some((d) => dimensionBlockIds.has(d.id));
  };

  return (
    <Stack className={S.browsePanel} data-testid="browse-panel">
      <TextInput
        className={S.browseSearch}
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
        placeholder={t`Search for a dimension`}
        leftSection={<Icon name="search" />}
      />
      <Box className={S.browseList}>
        <LoadingAndErrorWrapper
          loading={isFetching}
          error={error}
          style={{ height: "100%" }}
        >
          <DimensionList
            dimensions={groupRows}
            isSelected={isSelected}
            onToggle={(dimension) => {
              if (activeMetricBlock != null) {
                const wasSelected = isSelected(dimension.id);
                if (wasSelected) {
                  removeDimensionFromMetricBlock(
                    activeMetricBlock.id,
                    dimension.id,
                  );
                } else {
                  addDimensionToMetricBlock(activeMetricBlock.id, dimension);
                }
              } else {
                trackExplorationPlanEdited("manual", "dimensions");
                toggleDimension(dimension, {
                  group: groupByRowId.get(dimension.id) ?? null,
                  metricsByDimension,
                });
              }
            }}
            getDragContext={(dimension) => ({
              group: groupByRowId.get(dimension.id) ?? null,
              metricsByDimension,
            })}
          />
        </LoadingAndErrorWrapper>
      </Box>
    </Stack>
  );
}
