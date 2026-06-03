import type { ReactNode } from "react";
import { useState } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { UpsellGem } from "metabase/common/components/upsells/components/UpsellGem";
import { useHasTokenFeature, useSetting } from "metabase/common/hooks";
import { getCurrentTab } from "metabase/data-studio/app/pages/DataStudioLayout/utils";
import {
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
  PLUGIN_REMOTE_SYNC,
  PLUGIN_WORKSPACES,
} from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { getLocation } from "metabase/selectors/routing";
import { getUserIsAdmin } from "metabase/selectors/user";
import { canAccessTransforms as canAccessTransformsSelector } from "metabase/transforms/selectors";
import { Box } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { IconName } from "metabase-types/api";

import {
  PaddedSidebarLink,
  SidebarHeading,
  SidebarSection,
} from "../MainNavbar.styled";

type Props = {
  onItemSelect: () => void;
};

type DataStudioLink = {
  label: string;
  icon: IconName;
  to: string;
  isSelected: boolean;
  isGated?: boolean;
  right?: ReactNode;
};

/**
 * Data Studio navigation rendered in the unified main-navbar style. Mirrors the
 * destinations and permission gating of the old standalone Data Studio sidebar,
 * but as labelled sidebar rows under the "Data Studio" tab.
 */
export function DataStudioNavSection({ onItemSelect }: Props) {
  const pathname = useSelector((state) => getLocation(state).pathname) ?? "";
  const canAccessDataModel = useSelector(
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.canAccessDataModel,
  );
  const canAccessTransforms = useSelector(canAccessTransformsSelector);
  const canManageWorkspaces = useSelector(
    PLUGIN_WORKSPACES.canManageWorkspaces,
  );
  const hasDirtyChanges = PLUGIN_REMOTE_SYNC.useHasLibraryDirtyChanges();
  const hasTransformDirtyChanges =
    PLUGIN_REMOTE_SYNC.useHasTransformDirtyChanges();
  const [isGitSettingsOpen, setIsGitSettingsOpen] = useState(false);

  const hasLibraryFeature = useHasTokenFeature("library");
  const hasDependenciesFeature = useHasTokenFeature("dependencies");
  const hasSchemaViewerFeature = useHasTokenFeature("schema-viewer");
  const hasRemoteSyncFeature = useHasTokenFeature("remote_sync");

  const isAdmin = useSelector(getUserIsAdmin);
  const isRemoteSyncEnabled = useSetting("remote-sync-enabled");
  // Mirror GitSyncSetupMenuItem's visibility: only admins, and only before
  // remote sync has been configured.
  const showRemoteSyncSetup =
    hasRemoteSyncFeature && isAdmin && !isRemoteSyncEnabled;

  const currentTab = getCurrentTab(pathname);

  const SyncBadge = PLUGIN_REMOTE_SYNC.CollectionSyncStatusBadge;

  const topLinks: DataStudioLink[] = [
    {
      label: t`Library`,
      icon: "repository",
      to: Urls.dataStudioLibrary(),
      isSelected: currentTab === "library",
      isGated: !hasLibraryFeature,
      right: hasDirtyChanges && SyncBadge ? <SyncBadge /> : undefined,
    },
    ...(canAccessDataModel
      ? [
          {
            label: t`Tables`,
            icon: "open_folder" as IconName,
            to: Urls.dataStudioData(),
            isSelected: currentTab === "data",
          },
        ]
      : []),
    {
      label: t`Schema viewer`,
      icon: "network",
      to: Urls.dataStudioSchemaViewer(),
      isSelected: currentTab === "schema-viewer",
      isGated: !hasSchemaViewerFeature,
    },
    {
      label: t`Dependency graph`,
      icon: "dependencies",
      to: Urls.dependencyGraph(),
      isSelected: currentTab === "dependencies",
      isGated: !hasDependenciesFeature,
    },
    {
      label: t`Dependency diagnostics`,
      icon: "search_check",
      to: Urls.dependencyDiagnostics(),
      isSelected: currentTab === "dependency-diagnostics",
      isGated: !hasDependenciesFeature,
    },
    ...(canAccessTransforms
      ? [
          {
            label: t`Transforms`,
            icon: "transform" as IconName,
            to: Urls.transformList(),
            isSelected: currentTab === "transforms",
            right:
              hasTransformDirtyChanges && SyncBadge ? <SyncBadge /> : undefined,
          },
        ]
      : []),
    {
      label: t`Glossary`,
      icon: "glossary",
      to: Urls.dataStudioGlossary(),
      isSelected: currentTab === "glossary",
    },
  ];

  const bottomLinks: DataStudioLink[] = [
    ...(canManageWorkspaces
      ? [
          {
            label: t`Workspaces`,
            icon: "folder" as IconName,
            to: Urls.workspaces(),
            isSelected: currentTab === "workspaces",
          },
        ]
      : []),
    ...(canAccessTransforms
      ? [
          {
            label: t`Jobs`,
            icon: "clock" as IconName,
            to: Urls.transformJobList(),
            isSelected: currentTab === "jobs",
          },
          {
            label: t`Runs`,
            icon: "play_outlined" as IconName,
            to: Urls.transformRunList(),
            isSelected: currentTab === "runs",
          },
        ]
      : []),
  ];

  const renderLink = (link: DataStudioLink) => {
    const gem = link.isGated ? <UpsellGem.New size={14} /> : undefined;
    return (
      <PaddedSidebarLink
        key={link.label}
        icon={link.icon}
        url={link.to}
        isSelected={link.isSelected}
        onClick={onItemSelect}
        right={link.right ?? gem}
      >
        {link.label}
      </PaddedSidebarLink>
    );
  };

  return (
    <ErrorBoundary>
      <Box data-testid="data-studio-nav">
        {hasRemoteSyncFeature && (
          <Box px="md" pt="sm">
            <PLUGIN_REMOTE_SYNC.GitSyncAppBarControls />
          </Box>
        )}

        <SidebarSection>
          <SidebarHeading>{t`Data Studio`}</SidebarHeading>
          <Box mt="sm">{topLinks.map(renderLink)}</Box>
        </SidebarSection>

        <SidebarSection>
          {!hasRemoteSyncFeature && (
            <PaddedSidebarLink
              icon="gear"
              url={Urls.dataStudioGitSync()}
              isSelected={currentTab === "git-sync"}
              onClick={onItemSelect}
              right={<UpsellGem.New size={14} />}
            >
              {t`Set up remote sync`}
            </PaddedSidebarLink>
          )}
          {showRemoteSyncSetup && (
            <PaddedSidebarLink
              icon="gear"
              onClick={() => setIsGitSettingsOpen(true)}
            >
              {t`Set up remote sync`}
            </PaddedSidebarLink>
          )}
          {bottomLinks.map(renderLink)}
        </SidebarSection>

        <PLUGIN_REMOTE_SYNC.GitSettingsModal
          isOpen={isGitSettingsOpen}
          onClose={() => setIsGitSettingsOpen(false)}
        />
      </Box>
    </ErrorBoundary>
  );
}
