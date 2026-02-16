import { t } from "ttag";

import { Flex } from "metabase/ui";
import type { TriggeredDrillLens } from "metabase-lib/transforms-inspector";

import { DrillButton } from "./DrillButton";
import { useLensContentContext } from "./LensContent/LensContentContext";

type CardDrillsProps = {
  drillLenses: TriggeredDrillLens[];
};

export const CardDrills = ({ drillLenses }: CardDrillsProps) => {
  const { onDrill } = useLensContentContext();

  if (drillLenses.length === 0) {
    return null;
  }

  return (
    <Flex gap="xs" wrap="wrap">
      {drillLenses.map((drillLens) => {
        const title = drillLens.reason ?? drillLens.lens_id;
        return (
          <DrillButton
            key={drillLens.lens_id}
            onClick={() => onDrill(drillLens)}
          >
            {t`Inspect`} {title}
          </DrillButton>
        );
      })}
    </Flex>
  );
};
