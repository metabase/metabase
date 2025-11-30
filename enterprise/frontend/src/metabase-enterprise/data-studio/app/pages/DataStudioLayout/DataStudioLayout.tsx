import cx from "classnames";
import { type ReactNode, useMemo, useState } from "react";
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
import { DataStudioContext } from "metabase-enterprise/data-studio/common/contexts/DataStudioContext";

import S from "./DataStudioLayout.module.css";

type DataStudioLayoutProps = {
  children?: ReactNode;
};

export function DataStudioLayout({ children }: DataStudioLayoutProps) {
  const [isSidebarOpened, setIsSidebarOpened] = useState(false);
  const [isSidebarAvailable, setIsSidebarAvailable] = useState(false);
  const contextValue = useMemo(
    () => ({
      isSidebarOpened,
      isSidebarAvailable,
      setIsSidebarOpened,
      setIsSidebarAvailable,
    }),
    [isSidebarOpened, isSidebarAvailable],
  );

  return (
    <DataStudioContext.Provider value={contextValue}>
      <Flex h="100%">
        <DataStudioNav
          isSidebarOpened={isSidebarOpened}
          isSidebarAvailable={isSidebarAvailable}
          onSidebarToggle={setIsSidebarOpened}
        />
        <Box h="100%" flex={1} miw={0}>
          {children}
        </Box>
      </Flex>
    </DataStudioContext.Provider>
  );
}

type DataStudioNavProps = {
  isSidebarOpened: boolean;
  isSidebarAvailable: boolean;
  onSidebarToggle: (isOpened: boolean) => void;
};

function DataStudioNav({
  isSidebarOpened,
  isSidebarAvailable,
  onSidebarToggle,
}: DataStudioNavProps) {
  const { pathname } = useSelector(getLocation);
  const canAccessDataModel = useSelector(
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.canAccessDataModel,
  );
  const canAccessTransforms = useSelector(
    PLUGIN_TRANSFORMS.canAccessTransforms,
  );
  const isDataTab = pathname.startsWith(Urls.dataStudioData());
  const isTransformsTab = pathname.startsWith(Urls.transformList());
  const isModelingTab = pathname.startsWith(Urls.dataStudioModeling());
  const isDependenciesTab = pathname.startsWith(Urls.dependencyGraph());

  return (
    <Stack
      className={S.nav}
      h="100%"
      p="0.75rem"
      justify="space-between"
      data-testid="data-studio-nav"
    >
      <Stack gap="0.75rem">
        {canAccessDataModel && (
          <DataStudioTab
            label={t`Data`}
            icon="database"
            to={Urls.dataStudioData()}
            isSelected={isDataTab}
          />
        )}
        {canAccessTransforms && (
          <DataStudioTab
            label={t`Transforms`}
            icon="transform"
            to={Urls.transformList()}
            isSelected={isTransformsTab}
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
            isSelected={isDependenciesTab}
          />
        )}
      </Stack>
      {isSidebarAvailable && (
        <DataStudioSidebarToggle
          isSidebarOpened={isSidebarOpened}
          onSidebarToggle={onSidebarToggle}
        />
      )}
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
        p="0.75rem"
        bdrs="md"
        aria-label={label}
      >
        <FixedSizeIcon name={icon} display="block" />
      </Box>
    </Tooltip>
  );
}

type DataStudioSidebarToggleProps = {
  isSidebarOpened: boolean;
  onSidebarToggle: (isOpened: boolean) => void;
};

function DataStudioSidebarToggle({
  isSidebarOpened,
  onSidebarToggle,
}: DataStudioSidebarToggleProps) {
  return (
    <Tooltip
      label={isSidebarOpened ? t`Close sidebar` : t`Open sidebar`}
      openDelay={TOOLTIP_OPEN_DELAY}
    >
      <UnstyledButton
        className={S.toggle}
        p="0.75rem"
        bdrs="md"
        onClick={() => onSidebarToggle(!isSidebarOpened)}
      >
        <FixedSizeIcon
          name={isSidebarOpened ? "sidebar_closed" : "sidebar_open"}
        />
      </UnstyledButton>
    </Tooltip>
  );
}
