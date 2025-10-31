import { Link } from "react-router";

import * as Urls from "metabase/lib/urls";
import { Box, Icon, type IconName, Stack } from "metabase/ui";

import S from "./BenchNav.module.css";

export function BenchNav() {
  return (
    <Stack className={S.nav} justify="space-between" h="100%" p="0.75rem">
      <Stack>
        <BenchNavItem icon="database" to="" />
      </Stack>
      <Stack>
        <BenchNavItem icon="schema" to={Urls.dependencyGraph()} />
      </Stack>
    </Stack>
  );
}

type BenchNavItemProps = {
  icon: IconName;
  to: string;
};

function BenchNavItem({ to, icon }: BenchNavItemProps) {
  return (
    <Box
      className={S.item}
      component={Link}
      to={to}
      display="block"
      p="0.75rem"
      bdrs="md"
    >
      <Icon name={icon} />
    </Box>
  );
}
