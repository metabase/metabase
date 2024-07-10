import { useListRecentsQuery } from "metabase/api";
import { VisualizerMenuItem } from "metabase/visualizer/components/VisualizerMenuItem";
import { areCardsCompatible } from "metabase/visualizer/utils";
import type { RecentItem, Series } from "metabase-types/api";

export function VisualizerRecentsList({
  series,
  onAdd,
  onReplace,
}: {
  series: Series;
  onAdd: (item: RecentItem) => void;
  onReplace: (item: RecentItem) => void;
}) {
  const { data: recents = [] } = useListRecentsQuery();

  const mainCard = series[0]?.card;

  const cards = recents.filter(recent =>
    RECENT_ITEM_MODELS.includes(recent.model),
  );

  return (
    <div>
      {cards.map((card: any) => {
        const isUsed = series.some(series => series.card.id === card.id);
        return (
          <VisualizerMenuItem
            key={card.id}
            item={card}
            isAddable={
              !isUsed && Boolean(mainCard && areCardsCompatible(mainCard, card))
            }
            onAdd={onAdd}
            onReplace={onReplace}
          />
        );
      })}
    </div>
  );
}

const RECENT_ITEM_MODELS = ["card", "dataset", "metric"];
