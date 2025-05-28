import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { skipToken, useListRecentsQuery, useSearchQuery } from "metabase/api";
import { getDashboard } from "metabase/dashboard/selectors";
import { trackSimpleEvent } from "metabase/lib/analytics";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { isNotNull } from "metabase/lib/types";
import { Flex, Loader } from "metabase/ui";
import { getDataSources } from "metabase/visualizer/selectors";
import { createDataSource } from "metabase/visualizer/utils";
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

  const { data: searchResult, isFetching: isSearchLoading } = useSearchQuery(
    search.length > 0
      ? {
          q: search,
          limit: 10,
          models: ["card", "dataset", "metric"],
          include_dashboard_questions: true,
          include_metadata: true,
        }
      : skipToken,
    {
      refetchOnMountOrArgChange: true,
    },
  );

  const { data: allRecents = [], isLoading: isListRecentsLoading } =
    useListRecentsQuery(
      { include_metadata: true },
      {
        refetchOnMountOrArgChange: true,
      },
    );

  const items = useMemo(() => {
    if (search.length > 0) {
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
    }

    return allRecents
      .filter((maybeCard) =>
        ["card", "dataset", "metric"].includes(maybeCard.model),
      )
      .map((card) => ({
        ...createDataSource("card", card.id, card.name),
        display: card.display,
        result_metadata: card.result_metadata,
      }));
  }, [searchResult, allRecents, search, dashboardId]);

  if (isListRecentsLoading || isSearchLoading) {
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
