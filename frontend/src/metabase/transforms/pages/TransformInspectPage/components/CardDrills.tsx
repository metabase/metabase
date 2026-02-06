import { t } from "ttag";

import { Badge, Flex } from "metabase/ui";
import type { TriggeredDrillLens } from "metabase-lib/transforms-inspector";

type CardDrillsProps = {
  drillLenses: TriggeredDrillLens[];
  cardId: string;
  onDrill: (lens: TriggeredDrillLens) => void;
};

export const CardDrills = ({
  drillLenses,
  cardId,
  onDrill,
}: CardDrillsProps) => {
  const cardDrillsLenses = drillLenses.filter(
    (drillLens) => drillLens.condition.card_id === cardId,
  );

  if (cardDrillsLenses.length === 0) {
    return null;
  }

  return (
    <Flex gap="xs" wrap="wrap">
      {cardDrillsLenses.map((drillLens) => {
        const title = drillLens.reason ?? drillLens.lens_id;
        return (
          <Badge
            key={drillLens.lens_id}
            onClick={() => onDrill(drillLens)}
            style={{ cursor: "pointer" }}
          >
            {t`Inspect more:`} {title}
          </Badge>
        );
      })}
    </Flex>
  );
};
