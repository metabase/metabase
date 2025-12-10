import { Fragment } from "react";
import { Link } from "react-router";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { BaseCell } from "metabase/data-grid";
import { Anchor, Box, FixedSizeIcon, Flex, type IconName } from "metabase/ui";

import type { NodeLink } from "../../../../types";

import S from "./LocationCell.module.css";

type LocationCellProps = {
  links: NodeLink[];
  icon?: IconName;
};

export function LocationCell({ links, icon }: LocationCellProps) {
  return (
    <BaseCell className={S.cell}>
      <Flex align="center" gap="sm">
        {icon != null && <FixedSizeIcon name={icon} />}
        {links.map((link, linkIndex) => (
          <Fragment key={linkIndex}>
            {linkIndex > 0 && <Box>/</Box>}
            <Anchor className={S.link} component={Link} to={link.url}>
              <Ellipsified>{link.label}</Ellipsified>
            </Anchor>
          </Fragment>
        ))}
      </Flex>
    </BaseCell>
  );
}
