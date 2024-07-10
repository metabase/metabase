import { useMemo } from "react";

import { useListCompatibleCardsQuery } from "metabase/api";
import { VisualizerMenuItem } from "metabase/visualizer/components/VisualizerMenuItem";
import type { Card, Series } from "metabase-types/api";

interface VisualizerCompatibleCardsListProps {
  series: Series;
  onAdd: (item: Card) => void;
  onReplace: (item: Card) => void;
}

export function VisualizerCompatibleCardsList({
  series,
  onAdd,
  onReplace,
}: VisualizerCompatibleCardsListProps) {
  const [{ card: mainCard }] = series;

  const { data: cards = [] } = useListCompatibleCardsQuery({ id: mainCard.id });

  const notUsedCards = useMemo(() => {
    return cards.filter(card => !series.some(s => s.card.id === card.id));
  }, [cards, series]);

  return (
    <div>
      {notUsedCards.map(card => (
        <VisualizerMenuItem
          key={card.id}
          item={card}
          isAddable
          onAdd={onAdd}
          onReplace={onReplace}
        />
      ))}
    </div>
  );
}
