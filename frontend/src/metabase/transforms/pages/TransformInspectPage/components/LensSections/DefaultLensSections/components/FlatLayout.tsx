import { SimpleGrid, Stack } from "metabase/ui";
import type {
  CardStats,
  TriggeredAlert,
  TriggeredDrillLens,
} from "metabase-lib/transforms-inspector";
import type { InspectorCard, InspectorLens } from "metabase-types/api";

import { ScalarCard } from "./ScalarCard";
import { VisualizationCard } from "./VisualizationCard";

type FlatLayoutProps = {
  lens: InspectorLens;
  cards: InspectorCard[];
  alertsByCardId: Record<string, TriggeredAlert[]>;
  drillLensesByCardId: Record<string, TriggeredDrillLens[]>;
  onStatsReady: (cardId: string, stats: CardStats | null) => void;
  onDrill: (lens: TriggeredDrillLens) => void;
};

export const FlatLayout = ({
  lens,
  cards,
  alertsByCardId,
  drillLensesByCardId,
  onStatsReady,
  onDrill,
}: FlatLayoutProps) => {
  const scalarCards = cards.filter((c) => c.display === "scalar");
  const otherCards = cards.filter((c) => c.display !== "scalar");

  return (
    <Stack gap="md">
      {scalarCards.length > 0 && (
        <SimpleGrid cols={Math.min(scalarCards.length, 4)} spacing="md">
          {scalarCards.map((card) => (
            <ScalarCard
              key={card.id}
              lensId={lens.id}
              card={card}
              alerts={alertsByCardId[card.id] ?? []}
              drillLenses={drillLensesByCardId[card.id] ?? []}
              onStatsReady={onStatsReady}
              onDrill={onDrill}
            />
          ))}
        </SimpleGrid>
      )}
      {otherCards.map((card) => (
        <VisualizationCard
          key={card.id}
          lensId={lens.id}
          card={card}
          alerts={alertsByCardId[card.id] ?? []}
          drillLenses={drillLensesByCardId[card.id] ?? []}
          onStatsReady={onStatsReady}
          onDrill={onDrill}
        />
      ))}
    </Stack>
  );
};
