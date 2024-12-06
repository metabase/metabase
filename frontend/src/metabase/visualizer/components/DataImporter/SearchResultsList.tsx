import { useMemo } from "react";
import _ from "underscore";

import { skipToken, useSearchQuery } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { Box, Loader } from "metabase/ui";
import {
  getVisualizationType,
  getVisualizerComputedSettings,
  getVisualizerDatasetColumns,
} from "metabase/visualizer/selectors";
import { canCombineCard, createDataSource } from "metabase/visualizer/utils";
import type { VisualizerDataSourceId } from "metabase-types/store/visualizer";

import { ListItem } from "./ListItem";
import type { ResultsListProps } from "./ResultsList";
import { getScoreFn } from "./utils";

interface SearchResultsListProps {
  search: string;
  onSelect: ResultsListProps["onSelect"];
  dataSourceIds: Set<VisualizerDataSourceId>;
}

export function SearchResultsList({
  search,
  onSelect,
  dataSourceIds,
}: SearchResultsListProps) {
  const { data: result = { data: [] } } = useSearchQuery(
    search.length > 0
      ? {
          q: search,
          limit: 10,
          models: ["card", "dataset", "metric"],
        }
      : skipToken,
    {
      refetchOnMountOrArgChange: true,
    },
  );

  const display = useSelector(getVisualizationType);
  const columns = useSelector(getVisualizerDatasetColumns);
  const settings = useSelector(getVisualizerComputedSettings);

  const items = useMemo(() => {
    if (!Array.isArray(result.data) || result.data.length === 0) {
      return [];
    }
    const isEmpty = columns.length === 0;
    const calcBaseScore = getScoreFn(display);
    return _.chain(result.data)
      .map(item => {
        const cardLike = {
          id: item.id,
          name: item.name,
          dataset_query: item.dataset_query,
          display: item.display,
          result_metadata: item.result_metadata,
          visualization_settings: item.visualization_settings,
          type: item.model,
          colleciton: item.collection,
        };
        const dataSource = createDataSource("card", cardLike.id, cardLike.name);
        const isSelected = dataSourceIds.has(dataSource.id);
        const canCombine =
          isEmpty ||
          Boolean(
            display &&
              ["line", "area", "bar"].includes(display) &&
              canCombineCard(display, columns, settings, cardLike),
          );
        let score = calcBaseScore(cardLike);
        if (canCombine || isSelected) {
          score += 1000;
        }
        return {
          card: cardLike,
          dataSource,
          score: -score,
          canCombine,
          isSelected,
        };
      })
      .sortBy("score")
      .value();
  }, [columns, dataSourceIds, display, result, settings]);

  if (items.length === 0) {
    return <Loader />;
  }

  return (
    <Box component="ul">
      {items.map(({ card, dataSource, canCombine, isSelected }) => (
        <ListItem
          key={card.id}
          card={card}
          isMuted={!canCombine && !isSelected}
          isSelected={isSelected}
          onSelect={() => onSelect(dataSource)}
        />
      ))}
    </Box>
  );
}
