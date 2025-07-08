import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useListRecentsQuery, useSearchQuery } from "metabase/api";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { getDashboard } from "metabase/dashboard/selectors";
import { trackSimpleEvent } from "metabase/lib/analytics";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Flex, Loader } from "metabase/ui";
import {
  getDataSources,
  getDatasets,
  getVisualizationColumns,
  getVisualizationType,
  getVisualizerComputedSettings,
  getVisualizerComputedSettingsForFlatSeries,
  getVisualizerDatasetColumns,
} from "metabase/visualizer/selectors";
import { createDataSource } from "metabase/visualizer/utils";
import { partitionTimeDimensions } from "metabase/visualizer/visualizations/compat";
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

  const { data: allRecents = [], isLoading: isListRecentsLoading } =
    useListRecentsQuery(
      { include_metadata: true },
      {
        refetchOnMountOrArgChange: true,
      },
    );

  const { timeDimensions, otherDimensions } = useMemo(() => {
    return partitionTimeDimensions(visualizationColumns || []);
  }, [visualizationColumns]);

  const required_non_temporal_dimension_ids = useMemo(() => {
    return otherDimensions
      .map((dim) => dim.id)
      .filter((id) => id != null) as number[];
  }, [otherDimensions]);

  const {
    data: visualizationSearchResult,
    isLoading: isVisualizationSearchLoading,
  } = useSearchQuery(
    {
      q: search.length > 0 ? search : undefined,
      limit: 50,
      models: ["card", "dataset", "metric"],
      include_dashboard_questions: true,
      include_metadata: true,
      has_temporal_dimensions: timeDimensions.length > 0,
      required_non_temporal_dimension_ids,
    },
    {
      skip: muted,
      refetchOnMountOrArgChange: true,
    },
  );

  const debouncedIsVisualizationSearchLoading = useDebouncedValue(
    isVisualizationSearchLoading || isListRecentsLoading,
    300, // Adjust debounce duration as needed
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

  const items = useMemo(() => {
    if (!search && dataSources.length === 0) {
      return allRecents
        .filter((maybeCard) =>
          ["card", "dataset", "metric"].includes(maybeCard.model),
        )
        .map((card) => ({
          ...createDataSource("card", card.id, card.name),
          display: card.display,
          result_metadata: card.result_metadata,
        }));
    }

    return (visualizationSearchResult?.data || [])
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
      .filter((item) => {
        // Filter out incompatible items using client-side compatibility check
        if (!item.display || !item.result_metadata) {
          return false;
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
      })
      .sort((a, b) => a.name.localeCompare(b.name));
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

  const additionalProps =
    debouncedIsVisualizationSearchLoading || items.length === 0
      ? {
          align: "center",
          justify: "center",
          style: { height: "100%" },
        }
      : {};

  if (muted) {
    return null;
  }

  return (
    <Flex
      gap="xs"
      direction="column"
      data-testid="datasets-list"
      {...additionalProps}
      style={{ overflow: "auto", ...style }}
    >
      {debouncedIsVisualizationSearchLoading && <Loader />}
      {items.length === 0 && <p>{t`No compatible results`}</p>}
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
