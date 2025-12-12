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
    <Flex align="center" gap="sm">
      {icon && <FixedSizeIcon name={icon} />}
      {label}
    </Flex>
  );
}
