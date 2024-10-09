import { Box } from "metabase/ui";
import type { Card } from "metabase-types/api";

export type DataManagerProps = {
  cards: Card[];
};

export const DataManager = ({ cards }: DataManagerProps) => {
  return (
    <Box>
      Data manager
      <ul>
        {cards.map(card => (
          <li key={card.id}>{card.name}</li>
        ))}
      </ul>
    </Box>
  );
};
