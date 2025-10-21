import { Link } from "react-router";

import { Box, FixedSizeIcon, Flex, type IconName } from "metabase/ui";

import S from "./GraphNodeLink.module.css";

type GraphNodeLinkProps = {
  label: string;
  icon: IconName;
  url: string;
  target?: string;
};

export function GraphNodeLink({
  label,
  icon,
  url,
  target,
}: GraphNodeLinkProps) {
  return (
    <Box className={S.link} component={Link} to={url} target={target}>
      <Flex gap="sm" align="center">
        <FixedSizeIcon name={icon} c="brand" />
        <Box lh="h4">{label}</Box>
      </Flex>
    </Box>
  );
}
