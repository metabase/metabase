import { useEffect } from "react";

import { useProgressiveLoader } from "metabase/common/hooks";
import { SimpleGrid, Stack } from "metabase/ui";
import type { InspectorCard } from "metabase-types/api";

import { useLensContentContext } from "../../../LensContent/LensContentContext";

import { ScalarCard } from "./ScalarCard";
import { VisualizationCard } from "./VisualizationCard";

type FlatLayoutProps = {
  cards: InspectorCard[];
};

export const FlatLayout = ({ cards }: FlatLayoutProps) => {
  const { subscribeToCardLoaded } = useLensContentContext();
  const [visibleCards, markCardAsReady] = useProgressiveLoader({
    items: cards,
    getItemId: (card) => card.id,
    chunkSize: 4,
  });

  useEffect(
    () => subscribeToCardLoaded(markCardAsReady),
    [subscribeToCardLoaded, markCardAsReady],
  );

  const scalarCards = visibleCards.filter((c) => c.display === "scalar");
  const otherCards = visibleCards.filter((c) => c.display !== "scalar");

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
