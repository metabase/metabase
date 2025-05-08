import { useCallback, useMemo } from "react";
import _ from "underscore";

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
import type {
  DashboardId,
  SearchResult,
  VisualizerCardDataSource,
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
    (source: VisualizerCardDataSource) => {
      dispatch(
        addDataSource({ cardId: source.cardId, cardEntityId: source.sourceId }),
      );
      setDataSourceCollapsed(source.id, false);
    },
    [dispatch, setDataSourceCollapsed],
  );

  const handleRemoveDataSource = useCallback(
    (source: VisualizerDataSource) => {
      dispatch(removeDataSource(source));
      setDataSourceCollapsed(source.id, true);
    },
    [dispatch, setDataSourceCollapsed],
  );

  const handleToggleDataSource = useCallback(
    (item: VisualizerCardDataSource) => {
      if (dataSourceIds.has(item.id)) {
        handleRemoveDataSource(item);
      } else {
        handleAddDataSource(item);
      }
    },
    [dataSourceIds, handleAddDataSource, handleRemoveDataSource],
  );

  const handleSwapDataSources = useCallback(
    (item: VisualizerCardDataSource) => {
      dataSources.forEach((dataSource) => {
        handleRemoveDataSource(dataSource);
      });
      handleAddDataSource(item);
    },
    [dataSources, handleAddDataSource, handleRemoveDataSource],
  );

  const { data: result = { data: [] }, isLoading: isLoadingSearch } =
    useSearchQuery(
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

  const { data: allRecents = [], isLoading: isLoadingRecents } =
    useListRecentsQuery(undefined, {
      refetchOnMountOrArgChange: true,
    });

  const items: VisualizerCardDataSource[] = useMemo(() => {
    if (
      search.length === 0 ||
      !Array.isArray(result.data) ||
      result.data.length === 0
    ) {
      return allRecents
        .filter((maybeCard) =>
          ["card", "dataset", "metric"].includes(maybeCard.model),
        )
        .map((card) => {
          const entityId = "entity_id" in card ? card.entity_id : null;
          if (!entityId) {
            return null;
          }
          return {
            ...createDataSource("card", entityId, card.name),
            cardId: card.id,
          };
        })
        .filter(isNotNull);
    }
    return result.data
      .map((item) =>
        typeof item.entity_id === "string" &&
        shouldIncludeDashboardQuestion(item, dashboardId)
          ? {
              ...createDataSource("card", item.entity_id, item.name),
              cardId: Number(item.id),
            }
          : null,
      )
      .filter(isNotNull);
  }, [result, allRecents, search, dashboardId]);

  if (items.length === 0 && search.length > 0 && result.data.length > 0) {
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          background: "white",
          zIndex: 999,
        }}
      >
        <div>{JSON.stringify(result)}</div>
      </div>
    );
  }

  return (
    <Flex gap="xs" direction="column" data-testid="datasets-list">
      {items.map((item, index) => (
        <DatasetsListItem
          key={index}
          item={item}
          onSwap={handleSwapDataSources}
          onToggle={handleToggleDataSource}
          onRemove={handleRemoveDataSource}
          selected={dataSourceIds.has(item.id)}
        />
      ))}
    </Flex>
  );
}
