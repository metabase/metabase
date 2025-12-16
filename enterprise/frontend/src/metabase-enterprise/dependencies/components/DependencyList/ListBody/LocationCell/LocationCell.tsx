import { Fragment } from "react";

import { Box, FixedSizeIcon, Flex } from "metabase/ui";
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

  return (
    <Flex align="center" gap="sm">
      {links.map((link, linkIndex) => (
        <Fragment key={linkIndex}>
          {linkIndex > 0 && <Box>/</Box>}
          <Flex align="center" gap="sm">
            {linkIndex === 0 && icon && <FixedSizeIcon name={icon} />}
            {link.label}
          </Flex>
        </Fragment>
      ))}
    </Flex>
  );
}
