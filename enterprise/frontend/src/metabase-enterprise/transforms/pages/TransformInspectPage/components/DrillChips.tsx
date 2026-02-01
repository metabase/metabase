import { t } from "ttag";

import { Chip, Flex } from "metabase/ui";
import type { TriggeredDrillLens } from "metabase-lib/transforms-inspector";

import type { LensRef } from "../types";

type DrillChipsProps = {
  drills: TriggeredDrillLens[];
  onDrill: (lensRef: LensRef) => void;
};

export const DrillChips = ({ drills, onDrill }: DrillChipsProps) => {
  if (drills.length === 0) {
    return null;
  }

  return (
    <Flex gap="xs" wrap="wrap">
      {drills.map((drill) => {
        const title = drill.reason ?? drill.lens_id;
        return (
          <Chip
            key={drill.lens_id}
            checked={false}
            onChange={() =>
              onDrill({
                id: drill.lens_id,
                params: drill.params,
                title,
              })
            }
            variant="outline"
            size="xs"
          >
            {t`Inspect more`}
            {title}
          </Chip>
        );
      })}
    </Flex>
  );
};
