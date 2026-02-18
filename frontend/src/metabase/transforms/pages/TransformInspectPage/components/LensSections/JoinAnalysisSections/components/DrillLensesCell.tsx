import { t } from "ttag";

import { trackTransformInspectDrillLensClicked } from "metabase/transforms/analytics";
import { Flex } from "metabase/ui";
import type { TriggeredDrillLens } from "metabase-lib/transforms-inspector";
import type { TransformId } from "metabase-types/api";

import { getLensKey } from "../../../../utils";
import { DrillButton } from "../../../DrillButton";

type DrillLensesCellProps = {
  drillLenses: TriggeredDrillLens[];
  transformId: TransformId;
  onDrill: (lens: TriggeredDrillLens) => void;
};

export const DrillLensesCell = ({
  drillLenses,
  transformId,
  onDrill,
}: DrillLensesCellProps) => {
  if (drillLenses.length === 0) {
    return null;
  }

  return (
    <Flex direction="column" gap="xs">
      {drillLenses.map((drillLens) => (
        <DrillButton
          key={getLensKey(drillLens)}
          onClick={() => {
            trackTransformInspectDrillLensClicked({
              transformId,
              lensId: drillLens.lens_id,
              triggeredFrom: "join_analysis",
            });
            onDrill(drillLens);
          }}
        >
          {t`Inspect`} {drillLens.reason ?? drillLens.lens_id}
        </DrillButton>
      ))}
    </Flex>
  );
};
