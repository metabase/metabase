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
  const { pathname } = location;

  return (
    <Stack className={S.nav} justify="space-between" h="100%" p="0.75rem">
      <BenchNavItem
        to={Urls.bench()}
        icon="database"
        isSelected={
          pathname === Urls.bench() || pathname.startsWith(Urls.transformList())
        }
      />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <BenchNavItem
          icon="schema"
          to={Urls.dependencyGraph()}
          isSelected={pathname.startsWith(Urls.dependencyGraph())}
        />
      )}
    </Stack>
  );
}

type BenchNavItemProps = {
  to: string;
  icon: IconName;
  isSelected: boolean;
};

function BenchNavItem({ to, icon, isSelected }: BenchNavItemProps) {
  return (
    <Box
      className={cx(S.item, { [S.selected]: isSelected })}
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
