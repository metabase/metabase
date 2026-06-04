import { useMemo, useState } from "react";
import { t } from "ttag";

import { useGetExplorationDataQuery } from "metabase/api";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { trackExplorationPlanEdited } from "metabase/explorations/analytics";
import type { ExplorationSelection } from "metabase/explorations/hooks";
import type { ExplorationMetric } from "metabase/explorations/types";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
import type {
  DimensionId,
  ExplorationDimensionGroup,
} from "metabase-types/api";

import {
  filterDimensionGroupsBySearch,
  groupDimensionsByGroupSource,
} from "../utils";

import {
  AddEntitiesModal,
  type AddEntitiesModalItem,
} from "./AddEntitiesModal";

export interface AddDimensionsModalProps {
  opened: boolean;
  onClose: () => void;
  selection: ExplorationSelection;
}

export function AddDimensionsModal({
  opened,
  onClose,
  selection,
}: AddDimensionsModalProps) {
  const { addDimension } = selection;

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
      ),
    [response, debouncedSearch],
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

  // Group the per-source dimension groups under source-section headers,
  // mirroring the expanded MetricBlockItem list.
  const items = useMemo<AddEntitiesModalItem[]>(() => {
    // Represent each source-bucket group by its head dimension, carrying the
    // group's interestingness so sections + rows sort by it.
    const headDimensions = groups.map((group) => ({
      ...group.dimensions[0],
      dimension_interestingness: group.dimension_interestingness,
    }));
    const out: AddEntitiesModalItem[] = [];
    let groupLabel: string | undefined;
    for (const row of groupDimensionsByGroupSource(headDimensions)) {
      if (row.type === "header") {
        groupLabel = row.label;
      } else {
        out.push({
          key: row.dimension.id,
          label: row.dimension.display_name ?? row.dimension.id,
          groupLabel,
          interestingness: row.dimension.dimension_interestingness,
        });
      }
    }
    return out;
  }, [groups]);

  const handleAdd = (keys: string[]) => {
    trackExplorationPlanEdited("manual", "dimensions");
    for (const key of keys) {
      const group = groupByHeadId.get(key);
      if (group) {
        addDimension(group.dimensions[0], { group, metricsByDimension });
      }
    }
  };

  return (
    <AddEntitiesModal
      opened={opened}
      onClose={onClose}
      title={t`Add dimensions to your research plan`}
      searchPlaceholder={t`Search for a dimension`}
      search={search}
      onSearchChange={setSearch}
      items={items}
      isLoading={isFetching}
      error={error}
      onAdd={handleAdd}
    />
  );
}
