import cx from "classnames";
import { type ReactNode, useState } from "react";
import { t } from "ttag";

import DataStudioLogo from "assets/img/data-studio-logo.svg";
import { UpsellGem } from "metabase/admin/upsells/components/UpsellGem";
import { ForwardRefLink } from "metabase/common/components/Link";
import { useHasTokenFeature } from "metabase/common/hooks";
import { useUserKeyValue } from "metabase/common/hooks/use-user-key-value";
import { isMac } from "metabase/lib/browser";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import {
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
  PLUGIN_REMOTE_SYNC,
  PLUGIN_WORKSPACES,
} from "metabase/plugins";
import { getLocation } from "metabase/selectors/routing";
import { getUserIsAdmin } from "metabase/selectors/user";
import {
  canAccessTransforms as canAccessTransformsSelector,
  getTransformsFeatureAvailable,
} from "metabase/transforms/selectors";
import {
  ActionIcon,
  Box,
  Center,
  FixedSizeIcon,
  Flex,
  Group,
  type IconName,
  Loader,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";

import S from "./DataStudioLayout.module.css";
import { getCurrentTab } from "./utils";

type DataStudioLayoutProps = {
  children?: ReactNode;
};

export function DataStudioLayout({ children }: DataStudioLayoutProps) {
  const {
    value: _isNavbarOpened,
    setValue: setIsNavbarOpened,
    isLoading,
  } = useUserKeyValue({
    namespace: "data_studio",
    key: "isNavbarOpened",
  });
  const isNavbarOpened = _isNavbarOpened !== false;

  useRegisterShortcut(
    [
      {
        id: "toggle-navbar",
        perform: () => setIsNavbarOpened(!isNavbarOpened),
      },
    ],
    [isNavbarOpened],
  );

  return isLoading ? (
    <Center h="100%">
      <Loader />
    </Center>
  ) : (
    <Flex h="100%">
      <DataStudioNav
        isNavbarOpened={isNavbarOpened}
        onNavbarToggle={setIsNavbarOpened}
      />
      <Box h="100%" flex={1} miw={0}>
        {children}
      </Box>
    </Flex>
  );
}

type DataStudioNavProps = {
  isNavbarOpened: boolean;
  onNavbarToggle: (isOpened: boolean) => void;
};

function DataStudioNav({ isNavbarOpened, onNavbarToggle }: DataStudioNavProps) {
  const { pathname } = useSelector(getLocation);
  const isAdmin = useSelector(getUserIsAdmin);
  const canAccessDataModel = useSelector(
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.canAccessDataModel,
  );
  const canAccessTransforms = useSelector(canAccessTransformsSelector);
  const hasDirtyChanges = PLUGIN_REMOTE_SYNC.useHasLibraryDirtyChanges();
  const hasTransformDirtyChanges =
    PLUGIN_REMOTE_SYNC.useHasTransformDirtyChanges();
  const [isGitSettingsOpen, setIsGitSettingsOpen] = useState(false);

  const hasLibraryFeature = useHasTokenFeature("library");
  const hasDependenciesFeature = useHasTokenFeature("dependencies");
  const hasRemoteSyncFeature = useHasTokenFeature("remote_sync");
  const hasTransformsFeature = useSelector(getTransformsFeatureAvailable);

  const currentTab = getCurrentTab(pathname);

  return (
    <>
      <Stack
        className={cx(S.nav, { [S.opened]: isNavbarOpened })}
        h="100%"
        p="0.75rem"
        justify="space-between"
        data-testid="data-studio-nav"
      >
        <Stack gap="0.75rem" flex={1} mih={0} className={S.upperGroup}>
          <DataStudioNavbarToggle
            isNavbarOpened={isNavbarOpened}
            onNavbarToggle={onNavbarToggle}
          />
          <DataStudioTab
            label={t`Library`}
            icon="repository"
            to={Urls.dataStudioLibrary()}
            isSelected={currentTab === "library"}
            showLabel={isNavbarOpened}
            isGated={!hasLibraryFeature}
            rightSection={
              hasDirtyChanges &&
              PLUGIN_REMOTE_SYNC.CollectionSyncStatusBadge ? (
                <PLUGIN_REMOTE_SYNC.CollectionSyncStatusBadge />
              ) : null
            }
          />

          {canAccessDataModel && (
            <DataStudioTab
              label={t`Data structure`}
              icon="open_folder"
              to={Urls.dataStudioData()}
              isSelected={currentTab === "data"}
              showLabel={isNavbarOpened}
            />
          )}
          <DataStudioTab
            label={t`Glossary`}
            icon="glossary"
            to={Urls.dataStudioGlossary()}
            isSelected={currentTab === "glossary"}
            showLabel={isNavbarOpened}
          />
          <DataStudioTab
            label={t`Dependency graph`}
            icon="dependencies"
            to={Urls.dependencyGraph()}
            isSelected={currentTab === "dependencies"}
            showLabel={isNavbarOpened}
            isGated={!hasDependenciesFeature}
          />
          <DataStudioTab
            label={t`Dependency diagnostics`}
            icon="search_check"
            to={Urls.dependencyDiagnostics()}
            isSelected={currentTab === "dependency-diagnostics"}
            showLabel={isNavbarOpened}
            isGated={!hasDependenciesFeature}
          />
          {canAccessTransforms && (
            <DataStudioTab
              label={t`Transforms`}
              icon="transform"
              to={Urls.transformList()}
              isSelected={currentTab === "transforms"}
              showLabel={isNavbarOpened}
              isGated={!hasTransformsFeature}
              rightSection={
                hasTransformDirtyChanges &&
                PLUGIN_REMOTE_SYNC.CollectionSyncStatusBadge ? (
                  <PLUGIN_REMOTE_SYNC.CollectionSyncStatusBadge />
                ) : null
              }
            />
          )}
          {(canAccessTransforms || isAdmin) && (
            <PLUGIN_WORKSPACES.WorkspacesSection showLabel={isNavbarOpened} />
          )}
        </Stack>
        <Stack gap="0.75rem">
          {hasRemoteSyncFeature ? (
            <PLUGIN_REMOTE_SYNC.GitSyncSetupMenuItem
              isNavbarOpened={isNavbarOpened}
              onClick={() => setIsGitSettingsOpen(true)}
            />
          ) : (
            <DataStudioTab
              label={t`Set up git sync`}
              icon="gear"
              to={Urls.dataStudioGitSync()}
              isSelected={currentTab === "git-sync"}
              showLabel={isNavbarOpened}
              isGated
            />
          )}
          {canAccessTransforms && (
            <DataStudioTab
              label={t`Jobs`}
              icon="clock"
              to={Urls.transformJobList()}
              isSelected={currentTab === "jobs"}
              showLabel={isNavbarOpened}
            />
          )}
          {canAccessTransforms && (
            <DataStudioTab
              label={t`Runs`}
              icon="play_outlined"
              to={Urls.transformRunList()}
              isSelected={currentTab === "runs"}
              showLabel={isNavbarOpened}
            />
          )}
          <DataStudioTab
            label={t`Exit`}
            icon="exit"
            to={"/"}
            showLabel={isNavbarOpened}
          />
        </Stack>
        <PLUGIN_REMOTE_SYNC.GitSettingsModal
          isOpen={isGitSettingsOpen}
          onClose={() => setIsGitSettingsOpen(false)}
        />
      </Stack>
    </>
  );
}

type DataStudioTabProps = {
  label: string;
  icon: IconName;
  to: string;
  isSelected?: boolean;
  showLabel: boolean;
  rightSection?: ReactNode;
  isGated?: boolean;
};

const TOOLTIP_OPEN_DELAY = 1000;

function DataStudioTab({
  label,
  icon,
  to,
  isSelected,
  showLabel,
  rightSection,
  isGated,
}: DataStudioTabProps) {
  const upsellGem = isGated ? <UpsellGem.New size={14} /> : null;
  const effectiveRightSection = rightSection ?? upsellGem;

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
        aria-label={label}
      >
        <FixedSizeIcon name={icon} display="block" className={S.icon} />
        {showLabel && <Text lh="sm">{label}</Text>}
        {effectiveRightSection && (
          <Box
            className={showLabel ? undefined : S.badgeOverlay}
            ml={showLabel ? "auto" : undefined}
          >
            {effectiveRightSection}
          </Box>
        )}
      </Box>
    </Tooltip>
  );
}

const getSidebarTooltipLabel = (isNavbarOpened: boolean) => {
  const message = isNavbarOpened ? t`Close sidebar` : t`Open sidebar`;
  const shortcut = isMac() ? "(⌘ + .)" : "(Ctrl + .)";
  return `${message} ${shortcut}`;
};

type DataStudioNavbarToggleProps = {
  isNavbarOpened: boolean;
  onNavbarToggle: (isOpened: boolean) => void;
};

function DataStudioNavbarToggle({
  isNavbarOpened,
  onNavbarToggle,
}: DataStudioNavbarToggleProps) {
  return (
    <Flex
      align="center"
      justify="space-between"
      mb="0.75rem"
      mt="sm"
      mr="0.125rem"
    >
      <Group gap="sm">
        <Box
          className={cx(S.logoWrapper, { [S.navbarClosed]: !isNavbarOpened })}
        >
          <img
            alt={t`Data Studio Logo`}
            className={S.logo}
            src={DataStudioLogo}
          />
          {!isNavbarOpened && (
            <ToggleActionIcon
              isNavbarOpened={isNavbarOpened}
              onNavbarToggle={onNavbarToggle}
            />
          )}
        </Box>
        {isNavbarOpened && <PLUGIN_REMOTE_SYNC.GitSyncAppBarControls />}
      </Group>
      {isNavbarOpened && (
        <ToggleActionIcon isNavbarOpened onNavbarToggle={onNavbarToggle} />
      )}
    </Flex>
  );
}

type ToggleActionIconProps = DataStudioNavbarToggleProps & {
  className?: string;
};

function ToggleActionIcon(props: ToggleActionIconProps) {
  const { isNavbarOpened, onNavbarToggle } = props;
  const label = getSidebarTooltipLabel(isNavbarOpened);

  return (
    <Tooltip label={label} openDelay={1000}>
      <ActionIcon
        aria-label={label}
        className={S.toggle}
        onClick={() => onNavbarToggle(!isNavbarOpened)}
      >
        <FixedSizeIcon
          name={isNavbarOpened ? "sidebar_closed" : "sidebar_open"}
          c="text-secondary"
        />
      </ActionIcon>
    </Tooltip>
  );
}
