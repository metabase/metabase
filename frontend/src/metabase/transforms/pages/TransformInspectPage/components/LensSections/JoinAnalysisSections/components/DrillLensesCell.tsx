import { t } from "ttag";

import type { LensHandle } from "metabase/transforms/pages/TransformInspectPage/types";
import { Flex } from "metabase/ui";
import type { TriggeredDrillLens } from "metabase-lib/transforms-inspector";

import { DrillButton } from "../../../DrillButton";
import { getLensKey, toLensHandle } from "../../../LensNavigator/utils";

type DrillLensesCellProps = {
  drillLenses: TriggeredDrillLens[];
  navigateToLens: (lensHandle: LensHandle) => void;
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
        const lensHandle = toLensHandle(drillLens);
        return (
          <DrillButton
            key={getLensKey(lensHandle)}
            onClick={() => navigateToLens(lensHandle)}
          >
            {t`Inspect`} {drillLens.reason ?? drillLens.lens_id}
          </DrillButton>
        );
      })}
    </Flex>
  );
};
