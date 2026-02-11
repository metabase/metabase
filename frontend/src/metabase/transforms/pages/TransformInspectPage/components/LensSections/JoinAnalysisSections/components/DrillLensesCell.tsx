import { Flex, Icon, Text, UnstyledButton } from "metabase/ui";
import type { TriggeredDrillLens } from "metabase-lib/transforms-inspector";

import { getLensKey } from "../../../../utils";

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
        <UnstyledButton
          key={getLensKey(drillLens)}
          onClick={(e) => {
            e.stopPropagation();
            onDrill(drillLens);
          }}
        >
          <Flex gap="xs" align="center">
            <Icon name="zoom_in" c="brand" />
            <Text c="brand">{drillLens.reason ?? drillLens.lens_id}</Text>
          </Flex>
        </UnstyledButton>
      ))}
    </Flex>
  );
};
