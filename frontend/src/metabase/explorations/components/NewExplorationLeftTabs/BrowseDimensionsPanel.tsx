import { useMemo, useState } from "react";
import { t } from "ttag";

import { useGetExplorationDataQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import type { ExplorationSelection } from "metabase/explorations/hooks";
import type { ExplorationMetric } from "metabase/explorations/types";
import { Box, Icon, Stack, TextInput } from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
import type {
  DimensionId,
  ExplorationDimensionGroup,
  MetricDimension,
} from "metabase-types/api";

import { DimensionList } from "../NewExplorationData/DimensionList";

import S from "./NewExplorationLeftTabs.module.css";

export interface BrowseDimensionsPanelProps {
  selection: ExplorationSelection;
}

/**
 * Browse → Dimensions tab. Renders the group-headed dimension list as
 * wide cards (matching the Metrics panel), wiring each toggle straight
 * into `selection.toggleDimension`.
 */
export function BrowseDimensionsPanel({
  selection,
}: BrowseDimensionsPanelProps) {
  const { dimensions: selectedDimensions, toggleDimension } = selection;

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_DURATION);

  const {
    data: response,
    isFetching,
    error,
  } = useGetExplorationDataQuery({
    q: debouncedSearch.trim() || undefined,
  });

  const visibleGroups = useMemo<ExplorationDimensionGroup[]>(
    () => response?.dimension_groups ?? [],
    [response],
  );

  // Group representative row: take the first dimension as the row's
  // anchor so `DimensionList` can render one row per group.
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

  const selectedDimensionIds = useMemo(
    () => new Set(selectedDimensions.map((d) => d.id)),
    [selectedDimensions],
  );

  const isSelected = (dimensionId: DimensionId) => {
    const group = groupByRowId.get(dimensionId);
    if (!group) {
      return selectedDimensionIds.has(dimensionId);
    }
    return group.dimensions.some((d) => selectedDimensionIds.has(d.id));
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
            variant="card"
            dimensions={groupRows}
            isSelected={isSelected}
            onToggle={(dimension) =>
              toggleDimension(dimension, {
                group: groupByRowId.get(dimension.id) ?? null,
                metricsByDimension,
              })
            }
          />
        </LoadingAndErrorWrapper>
      </Box>
    </Stack>
  );
}
