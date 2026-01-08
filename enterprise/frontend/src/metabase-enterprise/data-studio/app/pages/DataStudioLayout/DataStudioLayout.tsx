import cx from "classnames";
import { type ReactNode, useState } from "react";
import { t } from "ttag";

import DataStudioLogo from "assets/img/data-studio-logo.svg";
import { ForwardRefLink } from "metabase/common/components/Link";
import { useUserKeyValue } from "metabase/common/hooks/use-user-key-value";
import { isMac } from "metabase/lib/browser";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
  PLUGIN_REMOTE_SYNC,
  PLUGIN_TRANSFORMS,
} from "metabase/plugins";
import { getLocation } from "metabase/selectors/routing";
import {
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
  UnstyledButton,
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
  const canAccessDataModel = useSelector(
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.canAccessDataModel,
  );
  const canAccessTransforms = useSelector(
    PLUGIN_TRANSFORMS.canAccessTransforms,
  );
  const hasDirtyChanges = PLUGIN_REMOTE_SYNC.useHasLibraryDirtyChanges();
  const [isGitSettingsOpen, setIsGitSettingsOpen] = useState(false);

  const currentTab = getCurrentTab(pathname);

  return (
    <Stack
      className={cx(S.nav, { [S.opened]: isNavbarOpened })}
      h="100%"
      p="0.75rem"
      justify="space-between"
      data-testid="data-studio-nav"
    >
      <Stack gap="0.75rem">
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
          rightSection={
            hasDirtyChanges && PLUGIN_REMOTE_SYNC.CollectionSyncStatusBadge ? (
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
        {canAccessDataModel && (
          <DataStudioTab
            label={t`Glossary`}
            icon="glossary"
            to={Urls.dataStudioGlossary()}
            isSelected={currentTab === "glossary"}
            showLabel={isNavbarOpened}
          />
        )}
        {PLUGIN_DEPENDENCIES.isEnabled && (
          <DataStudioTab
            label={t`Dependency graph`}
            icon="dependencies"
            to={Urls.dependencyGraph()}
            isSelected={currentTab === "dependencies"}
            showLabel={isNavbarOpened}
          />
        )}
        {PLUGIN_DEPENDENCIES.isEnabled && (
          <DataStudioTab
            label={t`Dependency diagnostics`}
            icon="list"
            to={Urls.dataStudioTasks()}
            isSelected={currentTab === "tasks"}
            showLabel={isNavbarOpened}
          />
        )}
        {canAccessTransforms && (
          <DataStudioTab
            label={t`Transforms`}
            icon="transform"
            to={Urls.transformList()}
            isSelected={currentTab === "transforms"}
            showLabel={isNavbarOpened}
          />
        )}
      </Stack>
      <Stack gap="0.75rem">
        <PLUGIN_REMOTE_SYNC.GitSyncSetupMenuItem
          isNavbarOpened={isNavbarOpened}
          onClick={() => setIsGitSettingsOpen(true)}
        />
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
  );
}

type DataStudioTabProps = {
  label: string;
  icon: IconName;
  to: string;
  isSelected?: boolean;
  showLabel: boolean;
  rightSection?: ReactNode;
};

const TOOLTIP_OPEN_DELAY = 1000;

function DataStudioTab({
  label,
  icon,
  to,
  isSelected,
  showLabel,
  rightSection,
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
        aria-label={label}
      >
        <FixedSizeIcon name={icon} display="block" className={S.icon} />
        {showLabel && <Text lh="sm">{label}</Text>}
        {rightSection && (
          <Box
            className={showLabel ? undefined : S.badgeOverlay}
            ml={showLabel ? "auto" : undefined}
          >
            {rightSection}
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
    <Flex justify="space-between" mb={2}>
      <Group gap="sm">
        <Tooltip
          label={getSidebarTooltipLabel(isNavbarOpened)}
          withArrow
          offset={-12}
          openDelay={1000}
        >
          <UnstyledButton
            className={cx(S.toggle, {
              [S.hoverButton]: !isNavbarOpened,
              [S.disablePointer]: isNavbarOpened,
            })}
            p="0.5rem"
            bdrs="md"
            onClick={() => !isNavbarOpened && onNavbarToggle(true)}
          >
            <img
              alt="Data Studio Logo"
              className={cx(S.hideOnHover, S.logo)}
              src={DataStudioLogo}
            />
            <FixedSizeIcon
              name="sidebar_open"
              className={S.showOnHover}
              c="text-secondary"
            />
          </UnstyledButton>
        </Tooltip>
        {isNavbarOpened && <PLUGIN_REMOTE_SYNC.GitSyncAppBarControls />}
      </Group>
      {isNavbarOpened && (
        <Tooltip
          label={getSidebarTooltipLabel(isNavbarOpened)}
          withArrow
          offset={-12}
          openDelay={1000}
        >
          <UnstyledButton
            className={S.toggle}
            p="0.5rem"
            bdrs="md"
            onClick={() => onNavbarToggle(false)}
          >
            <FixedSizeIcon name="sidebar_closed" c="text-secondary" />
          </UnstyledButton>
        </Tooltip>
      )}
    </Flex>
  );
}
