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
    </BaseCell>
  );
}
