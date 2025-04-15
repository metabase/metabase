import { useCallback, useMemo } from "react";

import { skipToken, useListRecentsQuery, useSearchQuery } from "metabase/api";
import { getDashboard } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { isNotNull } from "metabase/lib/types";
import { Flex, Loader } from "metabase/ui";
import { getDataSources } from "metabase/visualizer/selectors";
import { createDataSource } from "metabase/visualizer/utils";
import {
  addDataSource,
  removeDataSource,
} from "metabase/visualizer/visualizer.slice";
import type { DashboardId, SearchResult } from "metabase-types/api";
import type { VisualizerDataSource } from "metabase-types/store/visualizer";

import { DatasetsListItem } from "./DatasetsListItem";

function shouldIncludeDashboardQuestion(
  searchItem: SearchResult,
  dashboardId: DashboardId | undefined,
) {
  return searchItem.dashboard ? searchItem.dashboard.id === dashboardId : true;
}

interface DatasetsListProps {
  /**
   * The search term to filter datasets.
   */
  search: string;

  /**
   * Callback function to handle mouse over event on a dataset.
   * @param datasetId the dataset id
   * @param willAdd whether the dataset will be added or swapped
   */
  onDatasetMouseOver?: (datasetId: `card:${number}`, willAdd?: boolean) => void;

  /**
   * Callback function to handle mouse out event on a dataset.
   * @param datasetId the dataset id
   */
  onDatasetMouseOut?: (datasetId: `card:${number}`) => void;
}

export function DatasetsList({
  search,
  onDatasetMouseOut,
  onDatasetMouseOver,
}: DatasetsListProps) {
  const dashboardId = useSelector(getDashboard)?.id;
  const dispatch = useDispatch();
  const dataSources = useSelector(getDataSources);
  const dataSourceIds = useMemo(
    () => new Set(dataSources.map((s) => s.id)),
    [dataSources],
  );

  const onAdd = useCallback(
    (item: VisualizerDataSource) => {
      if (dataSourceIds.has(item.id)) {
        // remove data source if it exists
        dispatch(removeDataSource(item));
      } else {
        // add data source
        dispatch(addDataSource(item.id));
      }
    },
    [dispatch, dataSourceIds],
  );

  const onRemove = useCallback(
    (item: VisualizerDataSource) => {
      // remove data source
      dispatch(removeDataSource(item));
    },
    [dispatch],
  );

  const onSwap = useCallback(
    (item: VisualizerDataSource) => {
      // remove all data sources
      dataSources.forEach((dataSource) => {
        dispatch(removeDataSource(dataSource));
      });

      // add data source
      dispatch(addDataSource(item.id));
    },
    [dispatch, dataSources],
  );

  const { data: result = { data: [] } } = useSearchQuery(
    search.length > 0
      ? {
          q: search,
          limit: 10,
          models: ["card"],
          include_dashboard_questions: true,
        }
      : skipToken,
    {
      refetchOnMountOrArgChange: true,
    },
  );

  const { data: allRecents = [] } = useListRecentsQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });

  const items = useMemo(() => {
    if (
      search.length === 0 ||
      !Array.isArray(result.data) ||
      result.data.length === 0
    ) {
      return allRecents
        .filter((maybeCard) =>
          ["card", "dataset", "metric"].includes(maybeCard.model),
        )
        .map((card) => createDataSource("card", card.id, card.name));
    }
    return result.data
      .map((item) =>
        typeof item.id === "number" &&
        shouldIncludeDashboardQuestion(item, dashboardId)
          ? createDataSource("card", item.id, item.name)
          : null,
      )
      .filter(isNotNull);
  }, [result, allRecents, search, dashboardId]);

  if (items.length === 0) {
    return <Loader />;
  }

  return (
    <Flex gap="xs" direction="column" data-testid="datasets-list">
      {items.map((item, index) => (
        <DatasetsListItem
          key={index}
          item={item}
          onSwap={onSwap}
          onAdd={onAdd}
          onRemove={onRemove}
          selected={dataSourceIds.has(item.id)}
          onMouseOver={() => onDatasetMouseOver?.(item.id)}
          onMouseOut={() => onDatasetMouseOut?.(item.id)}
          onAddMouseOver={() => onDatasetMouseOver?.(item.id, true)}
          onAddMouseOut={() => onDatasetMouseOut?.(item.id)}
        />
      ))}
    </Flex>
  );
}
