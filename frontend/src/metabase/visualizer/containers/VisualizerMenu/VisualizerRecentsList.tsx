import { cardApi, useListRecentsQuery } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import { VisualizerMenuItem } from "metabase/visualizer/components/VisualizerMenuItem";

export function VisualizerRecentsList({
  onClick,
}: {
  onClick: (item: any) => void;
}) {
  const { data: recents = [] } = useListRecentsQuery();
  const dispatch = useDispatch();

  const cards = recents.filter(recent =>
    RECENT_ITEM_MODELS.includes(recent.model),
  );

  const handleClick = async (recentItem: any) => {
    const { data: card } = await dispatch(
      cardApi.endpoints.getCard.initiate({ id: recentItem.id }),
    );
    if (card) {
      onClick(card);
    }
  };

  return (
    <div>
      {cards.map((card: any) => (
        <VisualizerMenuItem key={card.id} item={card} onClick={handleClick} />
      ))}
    </div>
  );
}

const RECENT_ITEM_MODELS = ["card", "dataset", "metric"];
