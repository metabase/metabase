import cx from "classnames";
import type { Location } from "history";
import type { ReactNode } from "react";
import { Link } from "react-router";

import * as Urls from "metabase/lib/urls";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Box, Flex, Icon, type IconName, Stack } from "metabase/ui";

import S from "./BenchLayout.module.css";

type BenchLayoutProps = {
  location: Location;
  children?: ReactNode;
};

export function BenchLayout({ location, children }: BenchLayoutProps) {
  return (
    <Flex h="100%">
      <BenchNav location={location} />
      <Box h="100%" flex={1}>
        {children}
      </Box>
    </Flex>
  );
}

type BenchNavProps = {
  location: Location;
};

function BenchNav({ location }: BenchNavProps) {
  return (
    <Stack className={S.nav} justify="space-between" h="100%" p="0.75rem">
      <BenchNavItem icon="database" to={Urls.bench()} location={location} />
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
