import { t } from "ttag";

import { Flex } from "metabase/ui";
import type { TriggeredDrillLens } from "metabase-lib/transforms-inspector";

import { DrillButton } from "./DrillButton";
import { useLensContentContext } from "./LensContent/LensContentContext";
import { getLensKey, toLensRef } from "./LensNavigator/utils";

type CardDrillsProps = {
  drillLenses: TriggeredDrillLens[];
};

export const CardDrills = ({ drillLenses }: CardDrillsProps) => {
  const { navigateToLens } = useLensContentContext();

  if (drillLenses.length === 0) {
    return null;
  }

  return (
    <Flex gap="xs" wrap="wrap">
      {drillLenses.map((drillLens) => {
        const title = drillLens.reason ?? drillLens.lens_id;
        const lensRef = toLensRef(drillLens);
        return (
          <DrillButton
            key={getLensKey(lensRef)}
            onClick={() => navigateToLens(lensRef)}
          >
            {t`Inspect`} {title}
          </DrillButton>
        );
      })}
    </Flex>
  );
};
