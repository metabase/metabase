import { Fragment } from "react";
import { Link } from "react-router";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { Anchor, Box, FixedSizeIcon, Flex, type IconName } from "metabase/ui";

import type { NodeLink } from "../../../../types";

import S from "./LinkListCell.module.css";

type LinkListCellProps = {
  links: NodeLink[];
  icon?: IconName;
};

export function LinkListCell({ links, icon }: LinkListCellProps) {
  return (
    <Flex align="center" gap="sm">
      {links.map((link, linkIndex) => (
        <Fragment key={linkIndex}>
          {linkIndex > 0 && <Box>/</Box>}
          <Anchor className={S.link} component={Link} to={link.url}>
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
