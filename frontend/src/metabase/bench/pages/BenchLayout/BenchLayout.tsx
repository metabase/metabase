import cx from "classnames";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { getLocation } from "metabase/selectors/routing";
import { Box, Flex, Icon, type IconName, Stack } from "metabase/ui";

import S from "./BenchLayout.module.css";

type BenchLayoutProps = {
  children?: ReactNode;
};

export function BenchLayout({ children }: BenchLayoutProps) {
  return (
    <Flex h="100%">
      <BenchNav />
      <Box h="100%" flex={1}>
        {children}
      </Box>
    </Flex>
  );
}

function BenchNav() {
  const location = useSelector(getLocation);
  const { pathname } = location;

  return (
    <Stack className={S.nav} h="100%" p="0.75rem" gap="0.75rem">
      <BenchNavItem
        to={Urls.dataStudio()}
        icon="database"
        isSelected={
          pathname.startsWith(Urls.dataModel()) ||
          pathname.startsWith(Urls.transformList())
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
