import cx from "classnames";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { getLocation } from "metabase/selectors/routing";
import { Box, Flex, Icon, type IconName, Stack } from "metabase/ui";

import S from "./DataStudioLayout.module.css";

type DataStudioLayoutProps = {
  children?: ReactNode;
};

export function DataStudioLayout({ children }: DataStudioLayoutProps) {
  return (
    <Flex h="100%">
      <DataStudioNav />
      <Box h="100%" flex={1}>
        {children}
      </Box>
    </Flex>
  );
}

function DataStudioNav() {
  const location = useSelector(getLocation);
  const { pathname } = location;

  return (
    <Stack className={S.nav} h="100%" p="0.75rem" gap="0.75rem">
      <DataStudioNavItem
        to={Urls.dataModel()}
        icon="database"
        isSelected={
          pathname.startsWith(Urls.dataModel()) ||
          pathname.startsWith(Urls.transformList())
        }
      />
      <DataStudioNavItem
        to={Urls.dataStudioModeling()}
        icon="model"
        isSelected={pathname.startsWith(Urls.dataStudioModeling())}
      />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <DataStudioNavItem
          icon="schema"
          to={Urls.dependencyGraph()}
          isSelected={pathname.startsWith(Urls.dependencyGraph())}
        />
      )}
    </Stack>
  );
}

type DataStudioNavItemProps = {
  to: string;
  icon: IconName;
  isSelected: boolean;
};

function DataStudioNavItem({ to, icon, isSelected }: DataStudioNavItemProps) {
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
