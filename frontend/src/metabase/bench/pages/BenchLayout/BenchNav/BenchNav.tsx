import cx from "classnames";
import type { Location } from "history";
import { Link } from "react-router";

import * as Urls from "metabase/lib/urls";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Box, Icon, type IconName, Stack } from "metabase/ui";

import S from "./BenchNav.module.css";

type BenchNavProps = {
  location: Location;
};

export function BenchNav({ location }: BenchNavProps) {
  return (
    <Stack className={S.nav} justify="space-between" h="100%" p="0.75rem">
      <BenchNavItem icon="database" to="/bench/data" location={location} />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <BenchNavItem
          icon="schema"
          to={Urls.dependencyGraph()}
          location={location}
        />
      )}
    </Stack>
  );
}

type BenchNavItemProps = {
  icon: IconName;
  to: string;
  location: Location;
};

function BenchNavItem({ icon, to, location }: BenchNavItemProps) {
  const isActive = location.pathname.startsWith(to);

  return (
    <Box
      className={cx(S.item, { [S.active]: isActive })}
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
