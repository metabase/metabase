import { t } from "ttag";

import { Flex } from "metabase/ui";
import type { TriggeredDrillLens } from "metabase-lib/transforms-inspector";

import { getLensKey } from "../../../../utils";
import { DrillButton } from "../../../DrillButton";

type DrillLensesCellProps = {
  drillLenses: TriggeredDrillLens[];
  onDrill: (lens: TriggeredDrillLens) => void;
};

export const DrillLensesCell = ({
  drillLenses,
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
          onClick={() => onDrill(drillLens)}
        >
          {t`Inspect`} {drillLens.reason ?? drillLens.lens_id}
        </DrillButton>
      ))}
    </Flex>
  );
};
