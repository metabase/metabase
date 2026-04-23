import { Ellipsified, FixedSizeIcon, Group } from "metabase/ui";
import { TOOLTIP_OPEN_DELAY } from "metabase/utils/constants";
import type { DependencyNode } from "metabase-types/api";

import { getNodeIcon, getNodeLabel } from "../../../utils";

type NameCellProps = {
  node: DependencyNode;
};

export function NameCell({ node }: NameCellProps) {
  const label = getNodeLabel(node);
  const icon = getNodeIcon(node);

  return (
    <Group align="center" gap="sm" miw={0} wrap="nowrap">
      {icon && <FixedSizeIcon name={icon} />}
      <Ellipsified tooltipProps={{ openDelay: TOOLTIP_OPEN_DELAY }}>
        {label}
      </Ellipsified>
    </Group>
  );
}
