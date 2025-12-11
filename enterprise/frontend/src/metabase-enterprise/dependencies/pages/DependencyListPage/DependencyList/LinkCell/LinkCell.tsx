import { Link } from "react-router";

import { Anchor, FixedSizeIcon, Flex, type IconName } from "metabase/ui";

import S from "./LinkCell.module.css";

type LinkCellProps = {
  label: string;
  icon?: IconName;
  url?: string;
};

export function LinkCell({ label, icon, url = "" }: LinkCellProps) {
  return (
    <Anchor className={S.link} component={Link} to={url}>
      <Flex align="center" gap="sm">
        {icon && <FixedSizeIcon name={icon} />}
        {label}
      </Flex>
    </Anchor>
  );
}
