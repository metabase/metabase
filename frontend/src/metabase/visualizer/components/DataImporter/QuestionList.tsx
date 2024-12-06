import { useMemo } from "react";
import _ from "underscore";

import { useListCardsQuery } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { Box } from "metabase/ui";
import {
  getVisualizationType,
  getVisualizerComputedSettings,
  getVisualizerDatasetColumns,
} from "metabase/visualizer/selectors";
import { canCombineCard, createDataSource } from "metabase/visualizer/utils";
import type {
  VisualizerDataSource,
  VisualizerDataSourceId,
} from "metabase-types/store/visualizer";

import { ListItem } from "./ListItem";
import { getScoreFn } from "./utils";

interface QuestionListProps {
  dataSourceIds: Set<VisualizerDataSourceId>;
  onSelect: (item: VisualizerDataSource) => void;
}

export function QuestionList({ dataSourceIds, onSelect }: QuestionListProps) {
  const { data: cards = [], isLoading } = useListCardsQuery({ f: "all" });

  const display = useSelector(getVisualizationType);
  const columns = useSelector(getVisualizerDatasetColumns);
  const settings = useSelector(getVisualizerComputedSettings);

  const items = useMemo(() => {
    const isEmpty = columns.length === 0;
    const calcBaseScore = getScoreFn(display);
    return _.chain(cards)
      .map(card => {
        const dataSource = createDataSource("card", card.id, card.name);
        const isSelected = dataSourceIds.has(dataSource.id);
        const canCombine =
          isEmpty ||
          Boolean(
            display &&
              ["line", "area", "bar"].includes(display) &&
              canCombineCard(display, columns, settings, card),
          );
        let score = calcBaseScore(card);
        if (canCombine || isSelected) {
          score += 1000;
        }
        return { card, dataSource, score: -score, canCombine, isSelected };
      })
      .sortBy("score")
      .value();
  }, [cards, columns, dataSourceIds, display, settings]);

  if (isLoading) {
    return null;
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
