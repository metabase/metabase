import { Link } from "react-router";

import { Anchor, FixedSizeIcon, Flex } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { getNodeIcon, getNodeLabel, getNodeLink } from "../../../../utils";

type NameCellProps = {
  node: DependencyNode;
};

export function NameCell({ node }: NameCellProps) {
  const label = getNodeLabel(node);
  const icon = getNodeIcon(node);
  const link = getNodeLink(node);

  return (
    <Anchor component={Link} to={link?.url ?? ""}>
      <Flex align="center" gap="sm">
        {icon && <FixedSizeIcon name={icon} />}
        {label}
      </Flex>
    </Anchor>
  );
}
