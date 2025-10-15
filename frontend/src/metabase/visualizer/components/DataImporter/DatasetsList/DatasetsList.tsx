import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useListRecentsQuery, useSearchQuery } from "metabase/api";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { getDashboard } from "metabase/dashboard/selectors";
import { trackSimpleEvent } from "metabase/lib/analytics";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { isNotNull } from "metabase/lib/types";
import { Box, Flex, Skeleton } from "metabase/ui";
import { isCartesianChart } from "metabase/visualizations";
import {
  getDataSources,
  getDatasets,
  getVisualizationColumns,
  getVisualizationType,
  getVisualizerComputedSettings,
  getVisualizerComputedSettingsForFlatSeries,
  getVisualizerDatasetColumns,
} from "metabase/visualizer/selectors";
import {
  createDataSource,
  partitionTimeDimensions,
} from "metabase/visualizer/utils";
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

import { DatasetsListItem, type Item } from "./DatasetsListItem";
import { getIsCompatible } from "./getIsCompatible";

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
  style?: React.CSSProperties;
  /**
   * If true, the component will not render anything but simply load data
   * so next time it is rendered, it will show the data immediately.
   */
  muted?: boolean;
}

export function DatasetsList({
  search,
  setDataSourceCollapsed,
  style,
  muted,
}: DatasetsListProps) {
  const dashboardId = useSelector(getDashboard)?.id;
  const dispatch = useDispatch();
  const dataSources = useSelector(getDataSources);
  const dataSourceIds = useMemo(
    () => new Set(dataSources.map((s) => s.id)),
    [dataSources],
  );

  // Get current visualization context
  const visualizationType = useSelector(getVisualizationType);
  const visualizationColumns = useSelector(getVisualizationColumns);

  // Get data needed for compatibility checking
  const columns = useSelector(getVisualizerDatasetColumns);
  const settings = useSelector(getVisualizerComputedSettings);
  const computedSettings = useSelector(
    getVisualizerComputedSettingsForFlatSeries,
  );
  const datasets = useSelector(getDatasets);

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

  const { data: allRecents, isFetching: isListRecentsFetching } =
    useListRecentsQuery(
      { include_metadata: true },
      {
        refetchOnMountOrArgChange: true,
      },
    );

  const { timeDimensions, otherDimensions } = useMemo(() => {
    return partitionTimeDimensions(visualizationColumns || []);
  }, [visualizationColumns]);

  const nonTemporalDimIds = useMemo(() => {
    return otherDimensions
      .map((dim) => dim.id)
      .filter(isNotNull)
      .sort() as number[];
  }, [otherDimensions]);

  const { data: visualizationSearchResult, isFetching: isSearchFetching } =
    useSearchQuery(
      {
        q: search.length > 0 ? search : undefined,
        limit: 50,
        models: ["card", "dataset", "metric"],
        include_dashboard_questions: true,
        include_metadata: true,
        ...(visualizationType &&
          isCartesianChart(visualizationType) &&
          search.length === 0 && {
            has_temporal_dim: timeDimensions.length > 0,
            non_temporal_dim_ids: JSON.stringify(nonTemporalDimIds),
          }),
      },
      {
        skip: muted,
        refetchOnMountOrArgChange: true,
      },
    );

  const debouncedIsFetching = useDebouncedValue(
    isSearchFetching || isListRecentsFetching,
    300, // Adjust debounce duration as needed
    (_lastValue, newValue) => newValue === true, // We want instant updates when loading ends
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

  const items: Item[] | undefined = useMemo(() => {
    if (!search && dataSources.length === 0) {
      if (!allRecents) {
        return;
      }

      return allRecents
        .filter((maybeCard) =>
          ["card", "dataset", "metric"].includes(maybeCard.model),
        )
        .map((card) => ({
          ...createDataSource("card", card.id, card.name),
          display: card.display,
          result_metadata: card.result_metadata,
          notRecommended: false,
        }));
    }

    if (!visualizationSearchResult?.data) {
      return;
    }

    const isCompatible = (item: Item) => {
      if (!item.display || !item.result_metadata) {
        return item;
      }

      return getIsCompatible({
        currentDataset: {
          display: visualizationType ?? null,
          columns,
          settings,
          computedSettings,
        },
        targetDataset: {
          fields: item.result_metadata,
        },
        datasets,
      });
    };

    let results = visualizationSearchResult.data
      .filter(
        (maybeCard) =>
          ["card", "dataset", "metric"].includes(maybeCard.model) &&
          shouldIncludeDashboardQuestion(maybeCard, dashboardId),
      )
      .map((card) => ({
        ...createDataSource("card", +card.id, card.name),
        display: card.display,
        result_metadata: card.result_metadata,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (search.length > 0) {
      results = results.map((item) => ({
        ...item,
        notRecommended: !isCompatible(item),
      }));
    } else {
      results = results.filter(isCompatible);
    }

    return results;
  }, [
    visualizationSearchResult,
    dashboardId,
    visualizationType,
    columns,
    settings,
    computedSettings,
    datasets,
    allRecents,
    search,
    dataSources.length,
  ]);

  if (muted) {
    return null;
  }

  return (
    <Flex
      gap="xs"
      direction="column"
      data-testid="datasets-list"
      style={{ overflow: "auto", ...style }}
    >
      {debouncedIsFetching && (
        <>
          <Skeleton height={30} radius="sm" />
          <Skeleton height={30} mt={6} radius="sm" />
          <Skeleton height={30} mt={6} radius="sm" />
          <Skeleton height={30} mt={6} radius="sm" />
          <Skeleton height={30} mt={6} radius="sm" />
        </>
      )}
      {items && items.length === 0 && (
        <Box m="auto">{t`No compatible results`}</Box>
      )}
      {items && !debouncedIsFetching
        ? items.map((item, index) => (
            <DatasetsListItem
              key={index}
              item={item}
              onSwap={handleSwapDataSources}
              onToggle={handleAddDataSource}
              onRemove={handleRemoveDataSource}
              selected={dataSourceIds.has(item.id)}
            />
          ))
        : null}
    </Flex>
  );
}
