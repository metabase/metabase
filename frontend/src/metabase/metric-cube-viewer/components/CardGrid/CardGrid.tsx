import type { ReactNode } from "react";
import { t } from "ttag";

import { Button, Icon, SimpleGrid, Stack } from "metabase/ui";

import type { CubeCard as CubeCardModel } from "../../types";
import { CubeCard } from "../CubeCard";

export interface CardGridProps {
  cards: CubeCardModel[];
  onAddCard: () => void;
  renderCardActions?: (card: CubeCardModel) => ReactNode;
}

export function CardGrid({
  cards,
  onAddCard,
  renderCardActions,
}: CardGridProps) {
  return (
    <Stack gap="xl">
      <SimpleGrid
        cols={{ base: 1, md: 2 }}
        spacing="xl"
        data-testid="cube-card-grid"
      >
        {cards.map((card) => (
          <CubeCard
            key={card.id}
            card={card}
            actions={renderCardActions?.(card)}
          />
        ))}
      </SimpleGrid>
      <Button
        variant="subtle"
        leftSection={<Icon name="add" />}
        onClick={onAddCard}
        style={{ alignSelf: "flex-end" }}
      >
        {t`Add card`}
      </Button>
    </Stack>
  );
}
