import { useListRecentsQuery } from "metabase/api";
import { VisualizerMenuItem } from "metabase/visualizer/components/VisualizerMenuItem";

export function VisualizerRecentsList({
  onAdd,
  onReplace,
}: {
  onAdd: (item: any) => void;
  onReplace: (item: any) => void;
}) {
  const { data: recents = [] } = useListRecentsQuery();

  const cards = recents.filter(recent =>
    RECENT_ITEM_MODELS.includes(recent.model),
  );

  return (
    <div>
      {cards.map((card: any) => (
        <VisualizerMenuItem
          key={card.id}
          item={card}
          onAdd={onAdd}
          onReplace={onReplace}
        />
      ))}
    </div>
  );
}

const RECENT_ITEM_MODELS = ["card", "dataset", "metric"];
