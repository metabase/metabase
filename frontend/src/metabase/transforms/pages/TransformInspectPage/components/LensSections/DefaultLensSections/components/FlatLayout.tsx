import { SimpleGrid, Stack } from "metabase/ui";
import type { InspectorCard } from "metabase-types/api";

import { ScalarCard } from "./ScalarCard";
import { VisualizationCard } from "./VisualizationCard";

type FlatLayoutProps = {
  cards: InspectorCard[];
};

export const FlatLayout = ({ cards }: FlatLayoutProps) => {
  const scalarCards = cards.filter((c) => c.display === "scalar");
  const otherCards = cards.filter((c) => c.display !== "scalar");

  return (
    <Stack gap="md">
      {scalarCards.length > 0 && (
        <SimpleGrid cols={Math.min(scalarCards.length, 4)} spacing="md">
          {scalarCards.map((card) => (
            <ScalarCard key={card.id} card={card} />
          ))}
        </SimpleGrid>
      )}
      {otherCards.map((card) => (
        <VisualizationCard key={card.id} card={card} />
      ))}
    </Stack>
  );
};
