import cx from "classnames";
import { Link } from "react-router";

import CS from "metabase/css/core/index.css";
import { Box, FixedSizeIcon, Group, type IconName } from "metabase/ui";

import S from "./GraphLink.module.css";

type GraphLinkProps = {
  label: string;
  icon: IconName;
  url: string;
};

export function GraphLink({ label, icon, url }: GraphLinkProps) {
  return (
    <Box className={cx(S.link, CS.textWrap)} component={Link} to={url}>
      <Group gap="sm" align="center" wrap="nowrap">
        <FixedSizeIcon name={icon} c="brand" />
        <Box lh="h4">{label}</Box>
      </Group>
    </Box>
  );
}
