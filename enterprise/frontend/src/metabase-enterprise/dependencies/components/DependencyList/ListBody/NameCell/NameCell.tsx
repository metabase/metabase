import { Ellipsified } from "metabase/common/components/Ellipsified";
import { FixedSizeIcon, Flex } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { getNodeIcon, getNodeLabel } from "../../../../utils";

type NameCellProps = {
  node: DependencyNode;
};

export function NameCell({ node }: NameCellProps) {
  const label = getNodeLabel(node);
  const icon = getNodeIcon(node);

  return (
    <Flex align="center" gap="sm" miw={0}>
      {icon && <FixedSizeIcon name={icon} />}
      <Ellipsified>{label}</Ellipsified>
    </Flex>
  );
}
