import { t } from "ttag";

import { trackTransformInspectDrillLensClicked } from "metabase/transforms/analytics";
import { Flex } from "metabase/ui";
import type { InspectorDrillLensTrigger } from "metabase-types/api";

import { DrillButton } from "./DrillButton";
import { useLensContentContext } from "./LensContent/LensContentContext";
import { getLensKey, toLensHandle } from "./LensNavigator/utils";

type CardDrillsProps = {
  drillLenses: InspectorDrillLensTrigger[];
};

export const CardDrills = ({ drillLenses }: CardDrillsProps) => {
  const { navigateToLens, transform } = useLensContentContext();

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
            onClick={() => {
              trackTransformInspectDrillLensClicked({
                transformId: transform.id,
                lensId: drillLens.lens_id,
                triggeredFrom: "card_drills",
              });
              navigateToLens(lensHandle);
            }}
          >
            {t`Inspect`} {title}
          </DrillButton>
        );
      })}
    </Flex>
  );
};
