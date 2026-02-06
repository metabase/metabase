import { t } from "ttag";

import { Badge, Flex } from "metabase/ui";
import type { TriggeredDrillLens } from "metabase-lib/transforms-inspector";

type CardDrillsProps = {
  drillLenses: TriggeredDrillLens[];
  onDrill: (lens: TriggeredDrillLens) => void;
};

export const CardDrills = ({ drillLenses, onDrill }: CardDrillsProps) => {
  if (drillLenses.length === 0) {
    return null;
  }

  return (
    <Flex gap="xs" wrap="wrap">
      {drillLenses.map((drillLens) => {
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
