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
  Text,
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
  const [isNavbarOpened, setIsNavbarOpened] = useState(false);
  const [isSidebarAvailable, setIsSidebarAvailable] = useState(false);
  const contextValue = useMemo(
    () => ({
      isSidebarOpened,
      isSidebarAvailable,
      isNavbarOpened,
      setIsSidebarOpened,
      setIsSidebarAvailable,
      setIsNavbarOpened,
    }),
    [isSidebarOpened, isSidebarAvailable, isNavbarOpened],
  );

  return (
    <DataStudioContext.Provider value={contextValue}>
      <Flex h="100%">
        <DataStudioNav
          isSidebarOpened={isSidebarOpened}
          isSidebarAvailable={isSidebarAvailable}
          isNavbarOpened={isNavbarOpened}
          onSidebarToggle={setIsSidebarOpened}
          onNavbarToggle={setIsNavbarOpened}
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
  isNavbarOpened: boolean;
  onSidebarToggle: (isOpened: boolean) => void;
  onNavbarToggle: (isOpened: boolean) => void;
};

function DataStudioNav({
  isSidebarOpened,
  isSidebarAvailable,
  isNavbarOpened,
  onSidebarToggle,
  onNavbarToggle,
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
  const isJobsTab = pathname.startsWith(Urls.transformJobList());
  const isRunsTab = pathname.startsWith(Urls.transformRunList());

  return (
    <Stack
      className={cx(S.nav, { [S.opened]: isNavbarOpened })}
      h="100%"
      p="0.75rem"
      justify="space-between"
    >
      <Stack gap="0.75rem">
        <DataStudioNavbarToggle
          isNavbarOpened={isNavbarOpened}
          onNavbarToggle={onNavbarToggle}
        />

        {canAccessDataModel && (
          <DataStudioTab
            label={t`Data structure`}
            icon="database"
            to={Urls.dataStudioData()}
            isSelected={isDataTab}
            showLabel={isNavbarOpened}
          />
        )}
        {canAccessTransforms && (
          <DataStudioTab
            label={t`Transforms`}
            icon="transform"
            to={Urls.transformList()}
            isSelected={isTransformsTab}
            showLabel={isNavbarOpened}
          />
        )}
        <DataStudioTab
          label={t`Modeling`}
          icon="model"
          to={Urls.dataStudioModeling()}
          isSelected={isModelingTab}
          showLabel={isNavbarOpened}
        />
        {PLUGIN_DEPENDENCIES.isEnabled && (
          <DataStudioTab
            label={t`Dependency graph`}
            icon="schema"
            to={Urls.dependencyGraph()}
            isSelected={isDependenciesTab}
            showLabel={isNavbarOpened}
          />
        )}
      </Stack>
      <Stack gap="0.75rem">
        {canAccessTransforms && (
          <DataStudioTab
            label={t`Jobs`}
            icon="clock"
            to={Urls.transformJobList()}
            isSelected={isJobsTab}
            showLabel={isNavbarOpened}
          />
        )}
        {canAccessTransforms && (
          <DataStudioTab
            label={t`Runs`}
            icon="play"
            to={Urls.transformRunList()}
            isSelected={isRunsTab}
            showLabel={isNavbarOpened}
          />
        )}
        <DataStudioTab
          label={t`Exit`}
          icon="return"
          to={"/"}
          showLabel={isNavbarOpened}
        />
        {isSidebarAvailable && (
          <DataStudioSidebarToggle
            isSidebarOpened={isSidebarOpened}
            onSidebarToggle={onSidebarToggle}
          />
        )}
      </Stack>
    </Stack>
  );
}

type DataStudioTabProps = {
  label: string;
  icon: IconName;
  to: string;
  isSelected?: boolean;
  showLabel: boolean;
};

const TOOLTIP_OPEN_DELAY = 1000;

function DataStudioTab({
  label,
  icon,
  to,
  isSelected,
  showLabel,
}: DataStudioTabProps) {
  return (
    <Tooltip
      label={label}
      position="right"
      openDelay={TOOLTIP_OPEN_DELAY}
      disabled={showLabel}
    >
      <Box
        className={cx(S.tab, { [S.selected]: isSelected })}
        component={ForwardRefLink}
        to={to}
        p="0.5rem"
        bdrs="md"
      >
        <FixedSizeIcon name={icon} display="block" className={S.icon} />
        {showLabel && <Text lh="sm">{label}</Text>}
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
        p="0.5rem"
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

type DataStudioNavbarToggleProps = {
  isNavbarOpened: boolean;
  onNavbarToggle: (isOpened: boolean) => void;
};

function DataStudioNavbarToggle({
  isNavbarOpened,
  onNavbarToggle,
}: DataStudioNavbarToggleProps) {
  return (
    <Flex justify="space-between">
      <UnstyledButton
        className={S.toggle}
        p="0.5rem"
        bdrs="md"
        onClick={() => !isNavbarOpened && onNavbarToggle(true)}
      >
        <FixedSizeIcon name="data_studio" />
      </UnstyledButton>
      {isNavbarOpened && (
        <UnstyledButton
          className={S.toggle}
          p="0.5rem"
          bdrs="md"
          onClick={() => onNavbarToggle(false)}
        >
          <FixedSizeIcon name="sidebar_closed" />
        </UnstyledButton>
      )}
    </Flex>
  );
}
