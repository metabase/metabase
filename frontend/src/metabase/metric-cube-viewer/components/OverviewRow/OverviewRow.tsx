import type { ReactNode } from "react";

import { SimpleGrid } from "metabase/ui";

import type { CubeCard as CubeCardModel } from "../../types";
import { CubeCard } from "../CubeCard";

export interface OverviewRowProps {
  cards: CubeCardModel[];
  renderCardActions?: (card: CubeCardModel) => ReactNode;
}

export function OverviewRow({ cards, renderCardActions }: OverviewRowProps) {
  if (cards.length === 0) {
    return null;
  }

  return (
    <SimpleGrid
      cols={{ base: 1, sm: 2, md: 3, lg: 4 }}
      spacing="lg"
      data-testid="cube-overview-row"
    >
      {cards.map((card) => (
        <CubeCard
          key={card.id}
          card={card}
          variant="overview"
          actions={renderCardActions?.(card)}
        />
      ))}
    </SimpleGrid>
  );
}
