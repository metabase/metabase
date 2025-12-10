import { Link } from "react-router";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { BaseCell } from "metabase/data-grid";
import { Anchor, FixedSizeIcon, Flex, type IconName } from "metabase/ui";

import S from "./EntityCell.module.css";

type EntityCellProps = {
  name: string;
  icon: IconName;
  url?: string;
};

export function EntityCell({ name, icon, url = "" }: EntityCellProps) {
  return (
    <BaseCell className={S.cell}>
      <Anchor className={S.link} component={Link} to={url}>
        <Flex align="center" gap="sm">
          <FixedSizeIcon name={icon} />
          <Ellipsified>{name}</Ellipsified>
        </Flex>
      </Anchor>
    </BaseCell>
  );
}
