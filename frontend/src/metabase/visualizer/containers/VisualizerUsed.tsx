import { t } from "ttag";

import { Card, Title } from "metabase/ui";
import type { Card as ICard } from "metabase-types/api";

export function VisualizerUsed({ cards }: { cards?: ICard[] }) {
  return (
    <Card h="100%">
      <Title order={4}>{t`Being used`}</Title>
      {cards?.map((card, index) => (
        <div key={index}>{card.name}</div>
      ))}
    </Card>
  );
}
