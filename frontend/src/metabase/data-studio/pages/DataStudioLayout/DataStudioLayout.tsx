import cx from "classnames";
import { type ReactNode, useContext, useState } from "react";
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
import {
  Box,
  FixedSizeIcon,
  Flex,
  type IconName,
  Stack,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";

import { DataStudioContext } from "../../contexts/DataStudioContext";

import S from "./DataStudioLayout.module.css";

type DataStudioLayoutProps = {
  children?: ReactNode;
};

export function DataStudioLayout({ children }: DataStudioLayoutProps) {
  const [isSidebarOpened, setIsSidebarOpened] = useState(false);

  return (
    <DataStudioContext.Provider value={{ isSidebarOpened, setIsSidebarOpened }}>
      <Flex h="100%">
        <DataStudioNav />
        <Box h="100%" flex={1}>
          {children}
        </Box>
      </Flex>
    </DataStudioContext.Provider>
  );
}

function DataStudioNav() {
  const { pathname } = useSelector(getLocation);
  const canAccessDataModel = useSelector(
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.canAccessDataModel,
  );
  const canAccessTransforms = useSelector(
    PLUGIN_TRANSFORMS.canAccessTransforms,
  );
  const canAccessDataStructure = canAccessDataModel || canAccessTransforms;
  const isDataTab = pathname.startsWith(Urls.dataStudioData());
  const isTransformTab = pathname.startsWith(Urls.transformList());
  const isModelingTab = pathname.startsWith(Urls.dataStudioModeling());
  const isDependencyTab = pathname.startsWith(Urls.dependencyGraph());

  return (
    <Stack className={S.nav} h="100%" p="0.75rem" justify="space-between">
      <Stack gap="0.75rem">
        {canAccessDataStructure && (
          <DataStudioTab
            label={t`Data structure`}
            icon="database"
            to={
              canAccessDataModel ? Urls.dataStudioData() : Urls.transformList()
            }
            isSelected={isDataTab || isTransformTab}
          />
        )}
        <DataStudioTab
          label={t`Modeling`}
          icon="model"
          to={Urls.dataStudioModeling()}
          isSelected={isModelingTab}
        />
        {PLUGIN_DEPENDENCIES.isEnabled && (
          <DataStudioTab
            label={t`Dependency graph`}
            icon="schema"
            to={Urls.dependencyGraph()}
            isSelected={isDependencyTab}
          />
        )}
      </Stack>
      {isTransformTab && <DataStudioSidebarToggle />}
    </Stack>
  );
}

type DataStudioTabProps = {
  label: string;
  icon: IconName;
  to: string;
  isSelected: boolean;
};

const TOOLTIP_OPEN_DELAY = 1000;

function DataStudioTab({ label, icon, to, isSelected }: DataStudioTabProps) {
  return (
    <Tooltip label={label} position="right" openDelay={TOOLTIP_OPEN_DELAY}>
      <Box
        className={cx(S.tab, { [S.selected]: isSelected })}
        component={ForwardRefLink}
        to={to}
        display="block"
        p="0.75rem"
        bdrs="md"
      >
        <FixedSizeIcon name={icon} />
      </Box>
    </Tooltip>
  );
}

function DataStudioSidebarToggle() {
  const { isSidebarOpened, setIsSidebarOpened } = useContext(DataStudioContext);

  return (
    <Tooltip
      label={isSidebarOpened ? t`Close sidebar` : t`Open sidebar`}
      openDelay={TOOLTIP_OPEN_DELAY}
    >
      <UnstyledButton
        className={S.toggle}
        p="0.75rem"
        bdrs="md"
        onClick={() => setIsSidebarOpened(!isSidebarOpened)}
      >
        <FixedSizeIcon
          name={isSidebarOpened ? "sidebar_closed" : "sidebar_open"}
        />
      </UnstyledButton>
    </Tooltip>
  );
}
