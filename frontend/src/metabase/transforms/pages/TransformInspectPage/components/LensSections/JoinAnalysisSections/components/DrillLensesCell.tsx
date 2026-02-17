import { t } from "ttag";

import type { LensRef } from "metabase/transforms/pages/TransformInspectPage/types";
import { Flex } from "metabase/ui";
import type { TriggeredDrillLens } from "metabase-lib/transforms-inspector";

import { DrillButton } from "../../../DrillButton";
import { getLensKey, toLensRef } from "../../../LensNavigator/utils";

type DrillLensesCellProps = {
  drillLenses: TriggeredDrillLens[];
  navigateToLens: (lensRef: LensRef) => void;
};

export const DrillLensesCell = ({
  drillLenses,
  navigateToLens,
}: DrillLensesCellProps) => {
  if (drillLenses.length === 0) {
    return null;
  }

  return (
    <Flex direction="column" gap="xs">
      {drillLenses.map((drillLens) => {
        const lensRef = toLensRef(drillLens);
        return (
          <DrillButton
            key={getLensKey(lensRef)}
            onClick={() => navigateToLens(lensRef)}
          >
            {t`Inspect`} {drillLens.reason ?? drillLens.lens_id}
          </DrillButton>
        );
      })}
    </Flex>
  );
};
