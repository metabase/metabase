import { c } from "ttag";

import { trackTransformInspectDrillLensClicked } from "metabase/transforms/analytics";
import { Flex } from "metabase/ui";
import type {
  InspectorDrillLensTrigger,
  TransformId,
} from "metabase-types/api";

import type { LensHandle } from "../../../../types";
import { DrillButton } from "../../../DrillButton";
import { getLensKey, toLensHandle } from "../../../LensNavigator/utils";

type DrillLensesCellProps = {
  drillLenses: InspectorDrillLensTrigger[];
  transformId: TransformId;
  navigateToLens: (lensHandle: LensHandle) => void;
};

export const DrillLensesCell = ({
  drillLenses,
  transformId,
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
            onClick={() => {
              trackTransformInspectDrillLensClicked({
                transformId,
                lensId: drillLens.lens_id,
                triggeredFrom: "join_analysis",
              });
              navigateToLens(lensHandle);
            }}
          >
            {c("Button to inspect a specific aspect of a data join")
              .t`Inspect ${drillLens.reason ?? drillLens.lens_id}`}
          </DrillButton>
        );
      })}
    </Flex>
  );
};
