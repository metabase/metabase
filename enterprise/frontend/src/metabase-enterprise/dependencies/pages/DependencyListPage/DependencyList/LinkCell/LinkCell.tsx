import { Link } from "react-router";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { BaseCell } from "metabase/data-grid";
import { Anchor, FixedSizeIcon, Flex, type IconName } from "metabase/ui";

import S from "./LinkCell.module.css";

type LinkCellProps = {
  label: string;
  icon?: IconName;
  url?: string;
};

export function LinkCell({ label, icon, url = "" }: LinkCellProps) {
  return (
    <BaseCell className={S.cell}>
      <Anchor className={S.link} component={Link} to={url}>
        <Flex align="center" gap="sm">
          {icon && <FixedSizeIcon name={icon} />}
          <Ellipsified>{label}</Ellipsified>
        </Flex>
      </Anchor>
    </BaseCell>
  );
}
