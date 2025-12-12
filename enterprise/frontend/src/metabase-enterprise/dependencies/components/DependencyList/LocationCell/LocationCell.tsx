import { Fragment } from "react";
import { Link } from "react-router";

import { Anchor, Box, FixedSizeIcon, Flex } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { getNodeLocationInfo } from "../../../utils";
import S from "../DependencyList.module.css";

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
          <Anchor className={S.link} component={Link} to={link.url}>
            <Flex align="center" gap="sm">
              {linkIndex === 0 && icon && <FixedSizeIcon name={icon} />}
              {link.label}
            </Flex>
          </Anchor>
        </Fragment>
      ))}
    </Flex>
  );
}
