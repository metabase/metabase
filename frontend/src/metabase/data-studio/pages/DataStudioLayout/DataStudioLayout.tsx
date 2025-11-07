import cx from "classnames";
import type { ReactNode } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
  PLUGIN_TRANSFORMS,
} from "metabase/plugins";
import { getLocation } from "metabase/selectors/routing";
import { Box, Flex, Icon, type IconName, Stack, Tooltip } from "metabase/ui";

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
  const canAccessDataModel = useSelector(
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.canAccessDataModel,
  );
  const canAccessTransforms = useSelector(
    PLUGIN_TRANSFORMS.canAccessTransforms,
  );
  const canAccessDataStructure = canAccessDataModel || canAccessTransforms;

  return (
    <Stack className={S.nav} h="100%" p="0.75rem" gap="0.75rem">
      {canAccessDataStructure && (
        <DataStudioNavItem
          label={t`Data structure`}
          icon="database"
          to={Urls.dataModel()}
          isSelected={
            pathname.startsWith(Urls.dataModel()) ||
            pathname.startsWith(Urls.transformList())
          }
        />
      )}
      <DataStudioNavItem
        label={t`Modeling`}
        icon="model"
        to={Urls.dataStudioModeling()}
        isSelected={pathname.startsWith(Urls.dataStudioModeling())}
      />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <DataStudioNavItem
          label={t`Dependency graph`}
          icon="schema"
          to={Urls.dependencyGraph()}
          isSelected={pathname.startsWith(Urls.dependencyGraph())}
        />
      )}
    </Stack>
  );
}

type DataStudioNavItemProps = {
  label: string;
  icon: IconName;
  to: string;
  isSelected: boolean;
};

const TOOLTIP_OPEN_DELAY = 1000;

function DataStudioNavItem({
  label,
  icon,
  to,
  isSelected,
}: DataStudioNavItemProps) {
  return (
    <Tooltip label={label} position="right" openDelay={TOOLTIP_OPEN_DELAY}>
      <Box
        className={cx(S.item, { [S.selected]: isSelected })}
        component={ForwardRefLink}
        to={to}
        display="block"
        p="0.75rem"
        bdrs="md"
      >
        <Icon name={icon} />
      </Box>
    </Tooltip>
  );
}
