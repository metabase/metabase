import { t } from "ttag";

import { Flex } from "metabase/ui";
import type { TriggeredDrillLens } from "metabase-lib/transforms-inspector";

import { DrillButton } from "./DrillButton";
import { useLensContentContext } from "./LensContent/LensContentContext";
import { getLensKey, toLensHandle } from "./LensNavigator/utils";

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
        const lensHandle = toLensHandle(drillLens);
        return (
          <DrillButton
            key={getLensKey(lensHandle)}
            onClick={() => navigateToLens(lensHandle)}
          >
            {t`Inspect`} {title}
          </DrillButton>
        );
      })}
    </Flex>
  );
};
