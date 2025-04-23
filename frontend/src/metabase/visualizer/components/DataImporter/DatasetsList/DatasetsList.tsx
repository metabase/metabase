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
import type {
  VisualizerDataSource,
  VisualizerDataSourceId,
} from "metabase-types/store/visualizer";

import { useVisualizerUi } from "../../VisualizerUiContext";

import { DatasetsListItem } from "./DatasetsListItem";

function shouldIncludeDashboardQuestion(
  searchItem: SearchResult,
  dashboardId: DashboardId | undefined,
) {
  return searchItem.dashboard ? searchItem.dashboard.id === dashboardId : true;
}

interface DatasetsListProps {
  search: string;
}

export function DatasetsList({ search }: DatasetsListProps) {
  const { setDataSourceExpanded } = useVisualizerUi();
  const dashboardId = useSelector(getDashboard)?.id;
  const dispatch = useDispatch();
  const dataSources = useSelector(getDataSources);
  const dataSourceIds = useMemo(
    () => new Set(dataSources.map((s) => s.id)),
    [dataSources],
  );

  const handleAddDataSource = useCallback(
    (id: VisualizerDataSourceId) => {
      dispatch(addDataSource(id));
      setDataSourceExpanded(id, true);
    },
    [dispatch, setDataSourceExpanded],
  );

  const handleRemoveDataSource = useCallback(
    (source: VisualizerDataSource) => {
      dispatch(removeDataSource(source));
      setDataSourceExpanded(source.id, false);
    },
    [dispatch, setDataSourceExpanded],
  );

  const handleToggleDataSource = useCallback(
    (item: VisualizerDataSource) => {
      if (dataSourceIds.has(item.id)) {
        handleRemoveDataSource(item);
      } else {
        handleAddDataSource(item.id);
      }
    },
    [dataSourceIds, handleAddDataSource, handleRemoveDataSource],
  );

  const handleSwapDataSources = useCallback(
    (item: VisualizerDataSource) => {
      dataSources.forEach((dataSource) => {
        handleRemoveDataSource(dataSource);
      });
      handleAddDataSource(item.id);
    },
    [dataSources, handleAddDataSource, handleRemoveDataSource],
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
          onSwap={handleSwapDataSources}
          onToggle={handleToggleDataSource}
          onRemove={handleRemoveDataSource}
          selected={dataSourceIds.has(item.id)}
        />
      ))}
    </Flex>
  );
}
