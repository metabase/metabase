import { Link } from "react-router";

import * as Urls from "metabase/lib/urls";
import { Box, Flex, Icon, type IconName } from "metabase/ui";

import S from "./BenchNav.module.css";

export function BenchNav() {
  return (
    <Flex
      className={S.nav}
      direction="column"
      justify="space-between"
      h="100%"
      p="0.75rem"
    >
      <Box>
        <BenchNavItem icon="database" to="" />
      </Box>
      <Box>
        <BenchNavItem icon="schema" to={Urls.dependencyGraph()} />
      </Box>
    </Flex>
  );
}

type BenchNavItemProps = {
  icon: IconName;
  to: string;
};

function BenchNavItem({ to, icon }: BenchNavItemProps) {
  return (
    <Box className={S.item} component={Link} to={to} p="0.75rem">
      <Icon name={icon} />
    </Box>
  );
}
