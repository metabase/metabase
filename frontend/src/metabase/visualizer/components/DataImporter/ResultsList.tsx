import { useCallback, useMemo } from "react";

import { skipToken, useListRecentsQuery, useSearchQuery } from "metabase/api";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { isNotNull } from "metabase/lib/types";
import { Box, Loader } from "metabase/ui";
import { getDataSources } from "metabase/visualizer/selectors";
import { createDataSource } from "metabase/visualizer/utils";
import {
  addDataSource,
  removeDataSource,
} from "metabase/visualizer/visualizer.slice";
import type { VisualizerDataSource } from "metabase-types/store/visualizer";

import { Result } from "./Result";

interface ResultsListProps {
  search: string;
  mode: "swap" | "add" | "both";
}

export function ResultsList({ search, mode }: ResultsListProps) {
  const dispatch = useDispatch();
  const dataSources = useSelector(getDataSources);
  const dataSourceIds = useMemo(
    () => new Set(dataSources.map(s => s.id)),
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

  const onSwap = useCallback(
    (item: VisualizerDataSource) => {
      // remove all data sources
      dataSources.forEach(dataSource => {
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
        .filter(maybeCard =>
          ["card", "dataset", "metric"].includes(maybeCard.model),
        )
        .map(card => createDataSource("card", card.id, card.name));
    }
    return result.data
      .map(item =>
        typeof item.id === "number"
          ? createDataSource("card", item.id, item.name)
          : null,
      )
      .filter(isNotNull);
  }, [result, allRecents, search]);

  if (items.length === 0) {
    return <Loader />;
  }

  return (
    <Box component="ul" data-testid="results-list">
      {items.map((item, index) => (
        <Result
          key={index}
          item={item}
          onSwap={onSwap}
          onAdd={onAdd}
          selected={dataSourceIds.has(item.id)}
          mode={mode}
        />
      ))}
    </Box>
  );
}
