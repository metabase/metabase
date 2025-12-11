import { Fragment } from "react";
import { Link } from "react-router";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { Anchor, Box, FixedSizeIcon, Flex } from "metabase/ui";
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
          <Anchor component={Link} to={link.url}>
            <Flex align="center" gap="sm">
              {linkIndex === 0 && icon && <FixedSizeIcon name={icon} />}
              <Ellipsified>{link.label}</Ellipsified>
            </Flex>
          </Anchor>
        </Fragment>
      ))}
    </Flex>
  );
}
