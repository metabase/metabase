import { SimpleGrid, Stack } from "metabase/ui";
import type {
  TriggeredAlert,
  TriggeredDrillLens,
} from "metabase-lib/transforms-inspector";
import type { InspectorCard } from "metabase-types/api";

import type { CardStats, LensRef } from "../../../types";
import { LensCard, ScalarLensCard } from "../../LensCards";

type FlatLayoutProps = {
  cards: InspectorCard[];
  cardSummaries: Record<string, CardStats>;
  alerts: TriggeredAlert[];
  drillTriggers: TriggeredDrillLens[];
  onStatsReady: (cardId: string, stats: CardStats) => void;
  onDrill: (lensRef: LensRef) => void;
};

export const FlatLayout = ({
  cards,
  cardSummaries,
  alerts,
  drillTriggers,
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
            <ScalarLensCard
              key={card.id}
              card={card}
              cardSummaries={cardSummaries}
              onStatsReady={onStatsReady}
            />
          ))}
        </SimpleGrid>
      )}
      {otherCards.map((card) => (
        <LensCard
          key={card.id}
          card={card}
          cardSummaries={cardSummaries}
          alerts={alerts}
          drillTriggers={drillTriggers}
          onStatsReady={onStatsReady}
          onDrill={onDrill}
        />
      ))}
    </Stack>
  );
};
