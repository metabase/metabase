import { Ellipsified } from "metabase/common/components/Ellipsified";
import { FixedSizeIcon, Flex } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { getNodeLocationInfo } from "../../../../utils";

type LocationCellProps = {
  node: DependencyNode;
};

export function LocationCell({ node }: LocationCellProps) {
  const location = getNodeLocationInfo(node);

  if (location == null) {
    return null;
  }

  const { icon, links } = location;
  const path = links.map((link) => link.label).join(" / ");

  return (
    <Flex align="center" gap="sm" miw={0}>
      {icon && <FixedSizeIcon name={icon} />}
      <Ellipsified tooltipProps={{ openDelay: 300 }}>{path}</Ellipsified>
    </Flex>
  );
}
