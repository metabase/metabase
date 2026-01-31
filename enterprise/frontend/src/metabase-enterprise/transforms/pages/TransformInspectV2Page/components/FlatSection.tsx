import { SimpleGrid } from "metabase/ui";
import type { InspectorV2Card } from "metabase-types/api";

import { InspectorCard, ScalarCard } from "./InspectorCard";

type FlatSectionProps = {
  cards: InspectorV2Card[];
};

export const FlatSection = ({ cards }: FlatSectionProps) => {
  // Group scalars together for compact display
  const scalarCards = cards.filter((c) => c.display === "scalar");
  const otherCards = cards.filter((c) => c.display !== "scalar");

  return (
    <>
      {scalarCards.length > 0 && (
        <SimpleGrid cols={Math.min(scalarCards.length, 4)} spacing="md">
          {scalarCards.map((card) => (
            <ScalarCard key={card.id} card={card} />
          ))}
        </SimpleGrid>
      )}
      {otherCards.length > 0 && (
        <SimpleGrid cols={2} spacing="md">
          {otherCards.map((card) => (
            <InspectorCard key={card.id} card={card} />
          ))}
        </SimpleGrid>
      )}
    </>
  );
};
