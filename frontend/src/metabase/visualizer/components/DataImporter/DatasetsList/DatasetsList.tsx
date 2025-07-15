import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useSearchQuery } from "metabase/api";
import { getDashboard } from "metabase/dashboard/selectors";
import { trackSimpleEvent } from "metabase/lib/analytics";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { isNotNull } from "metabase/lib/types";
import { Flex, Loader } from "metabase/ui";
import {
  getDataSources,
  getVisualizationColumns,
} from "metabase/visualizer/selectors";
import { createDataSource } from "metabase/visualizer/utils";
import { partitionTimeDimensions } from "metabase/visualizer/utils/column";
import {
  addDataSource,
  removeDataSource,
} from "metabase/visualizer/visualizer.slice";
import type {
  DashboardId,
  SearchResult,
  VisualizerDataSource,
  VisualizerDataSourceId,
} from "metabase-types/api";

import { DatasetsListItem } from "./DatasetsListItem";

function shouldIncludeDashboardQuestion(
  searchItem: SearchResult,
  dashboardId: DashboardId | undefined,
) {
  return searchItem.dashboard ? searchItem.dashboard.id === dashboardId : true;
}

interface DatasetsListProps {
  search: string;
  setDataSourceCollapsed: (
    sourceId: VisualizerDataSourceId,
    collapsed: boolean,
  ) => void;
}

export function DatasetsList({
  search,
  setDataSourceCollapsed,
}: DatasetsListProps) {
  const dashboardId = useSelector(getDashboard)?.id;
  const dispatch = useDispatch();
  const dataSources = useSelector(getDataSources);
  const dataSourceIds = useMemo(
    () => new Set(dataSources.map((s) => s.id)),
    [dataSources],
  );

  const visualizationColumns = useSelector(getVisualizationColumns);
  const { otherDimensions } = useMemo(() => {
    return partitionTimeDimensions(visualizationColumns || []);
  }, [visualizationColumns]);

  const nonTemporalDimIds = useMemo(() => {
    return otherDimensions
      .map((dim) => dim.id)
      .filter((id) => id != null)
      .sort((a, b) => a - b) as number[];
  }, [otherDimensions]);

  const handleAddDataSource = useCallback(
    (source: VisualizerDataSource) => {
      trackSimpleEvent({
        event: "visualizer_data_changed",
        event_detail: "visualizer_datasource_added",
        triggered_from: "visualizer-modal",
      });

      dispatch(addDataSource(source.id));
      setDataSourceCollapsed(source.id, false);
    },
    [dispatch, setDataSourceCollapsed],
  );

  const handleRemoveDataSource = useCallback(
    (source: VisualizerDataSource, forget?: boolean) => {
      trackSimpleEvent({
        event: "visualizer_data_changed",
        event_detail: "visualizer_datasource_removed",
        triggered_from: "visualizer-modal",
      });

      dispatch(removeDataSource({ source, forget }));
      setDataSourceCollapsed(source.id, true);
    },
    [dispatch, setDataSourceCollapsed],
  );

  const handleSwapDataSources = useCallback(
    (item: VisualizerDataSource) => {
      trackSimpleEvent({
        event: "visualizer_data_changed",
        event_detail: "visualizer_datasource_replaced",
        triggered_from: "visualizer-modal",
      });

      dataSources.forEach((dataSource) => {
        handleRemoveDataSource(dataSource, true);
      });
      handleAddDataSource(item);
    },
    [dataSources, handleAddDataSource, handleRemoveDataSource],
  );

  const { data: searchResult, isFetching: isSearchLoading } = useSearchQuery(
    {
      ...(search.length > 0 && { q: search }),
      limit: 10,
      models: ["card", "dataset", "metric"],
      include_dashboard_questions: true,
      include_metadata: true,
      non_temporal_dim_ids: JSON.stringify(nonTemporalDimIds),
      //search_engine: "in-place",
    },
    {
      refetchOnMountOrArgChange: true,
    },
  );

  const items = useMemo(() => {
    return (searchResult ? searchResult.data : [])
      .map((item) =>
        typeof item.id === "number" &&
        shouldIncludeDashboardQuestion(item, dashboardId)
          ? {
              ...createDataSource("card", item.id, item.name),
              result_metadata: item.result_metadata,
              display: item.display,
            }
          : null,
      )
      .filter(isNotNull);
  }, [searchResult, dashboardId]);

  if (isSearchLoading) {
    return (
      <Flex
        gap="xs"
        direction="column"
        align="center"
        justify="center"
        style={{ height: "100%" }}
      >
        <Loader />
      </Flex>
    );
  }

  if (items.length === 0) {
    return (
      <Flex
        gap="xs"
        direction="column"
        align="center"
        justify="center"
        style={{ height: "100%" }}
      >
        <p>{t`No results`}</p>
      </Flex>
    );
  }

  return (
    <Flex gap="xs" direction="column" data-testid="datasets-list">
      {items.map((item, index) => (
        <DatasetsListItem
          key={index}
          item={item}
          onSwap={handleSwapDataSources}
          onToggle={handleAddDataSource}
          onRemove={handleRemoveDataSource}
          selected={dataSourceIds.has(item.id)}
        />
      ))}
    </Flex>
  );
}
