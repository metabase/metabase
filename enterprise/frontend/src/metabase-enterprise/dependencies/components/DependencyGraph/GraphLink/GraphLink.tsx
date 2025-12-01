import { Link } from "react-router";

import { Box, FixedSizeIcon, Flex, type IconName } from "metabase/ui";

import S from "./GraphLink.module.css";

type GraphLinkProps = {
  label: string;
  icon: IconName;
  url: string;
};

export function GraphLink({ label, icon, url }: GraphLinkProps) {
  return (
    <Box className={S.link} component={Link} to={url}>
      <Flex gap="sm" align="center">
        <FixedSizeIcon name={icon} c="brand" />
        <Box lh="h4">{label}</Box>
      </Flex>
    </Box>
  );
}
