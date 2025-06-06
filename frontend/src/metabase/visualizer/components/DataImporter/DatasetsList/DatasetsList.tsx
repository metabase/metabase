import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { useVisualizationCompatibleSearchMutation } from "metabase/api";
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

  // State to store visualization search results
  const [visualizationSearchResult, setVisualizationSearchResult] = useState<
    any[]
  >([]);
  const [isVisualizationSearchLoading, setIsVisualizationSearchLoading] =
    useState(false);

  // Test the new visualization-compatible endpoint
  const [triggerVisualizationSearch] =
    useVisualizationCompatibleSearchMutation();

  const handleAddDataSource = useCallback(
    (source: VisualizerDataSource) => {
      trackSimpleEvent({
        event: "visualizer_data_changed",
        event_detail: "visualizer_datasource_added",
        triggered_from: "visualizer-modal",
        event_data: source.id,
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
        event_data: source.id,
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
        event_data: item.id,
      });

      dataSources.forEach((dataSource) => {
        handleRemoveDataSource(dataSource, true);
      });
      handleAddDataSource(item);
    },
    [dataSources, handleAddDataSource, handleRemoveDataSource],
  );

  // Use visualization-compatible endpoint for both search and recent items
  useEffect(() => {
    // Only trigger when we have visualization context
    if (visualizationType && visualizationColumns) {
      setIsVisualizationSearchLoading(true);

      // Extract dimension IDs from current visualization columns
      const { timeDimensions, otherDimensions } =
        partitionTimeDimensions(visualizationColumns);

      const payload = {
        q: search.length > 0 ? search : undefined, // Include search query if present
        limit: 50,
        models: ["card", "dataset", "metric"] as Array<
          "card" | "dataset" | "metric"
        >,
        include_dashboard_questions: true,
        include_metadata: true,
        visualization_context: {
          display: visualizationType || null,
          dimensions: {
            temporal: timeDimensions
              .map((col) => col.id)
              .filter((id): id is number => id != null),
            non_temporal: otherDimensions
              .map((col) => col.id)
              .filter((id): id is number => id != null),
          },
        },
      };

      triggerVisualizationSearch(payload)
        .then((result) => {
          setVisualizationSearchResult(result.data?.data || []);
          setIsVisualizationSearchLoading(false);
        })
        .catch((error) => {
          console.error("Visualization-compatible endpoint error:", error);
          setVisualizationSearchResult([]);
          setIsVisualizationSearchLoading(false);
        });
    }
  }, [
    search,
    visualizationType,
    visualizationColumns,
    triggerVisualizationSearch,
  ]);

  const items = useMemo(() => {
    if (!visualizationType || !columns || !settings || !computedSettings) {
      return [];
    }

    return visualizationSearchResult
      .filter(
        (maybeCard) =>
          ["card", "dataset", "metric"].includes(maybeCard.model) &&
          shouldIncludeDashboardQuestion(maybeCard, dashboardId),
      )
      .map((card) => ({
        ...createDataSource("card", card.id, card.name),
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
            display: visualizationType,
            columns,
            settings,
            computedSettings,
          },
          targetDataset: {
            fields: item.result_metadata,
          },
          datasets,
        });
      });
  }, [
    visualizationSearchResult,
    dashboardId,
    visualizationType,
    columns,
    settings,
    computedSettings,
    datasets,
  ]);

  if (isVisualizationSearchLoading) {
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
