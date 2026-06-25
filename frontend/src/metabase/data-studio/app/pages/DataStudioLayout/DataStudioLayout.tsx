import { type ReactNode, useState } from "react";
import { t } from "ttag";

import DataStudioLogo from "assets/img/data-studio-logo.svg";
import { useHasTokenFeature } from "metabase/common/hooks";
import { useUserKeyValue } from "metabase/common/hooks/use-user-key-value";
import { SpaceLayout, SpaceTab } from "metabase/nav/components/SpaceLayout";
import {
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
  PLUGIN_REMOTE_SYNC,
  PLUGIN_WORKSPACES,
} from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { getLocation } from "metabase/selectors/routing";
import { canAccessTransforms as canAccessTransformsSelector } from "metabase/transforms/selectors";
import * as Urls from "metabase/urls";

import { getCurrentTab } from "./utils";

type DataStudioLayoutProps = {
  children?: ReactNode;
};

export function DataStudioLayout({ children }: DataStudioLayoutProps) {
  const {
    value: _isNavbarOpened,
    setValue: setIsNavbarOpened,
    isLoading: isLoadingNavbarKey,
  } = useUserKeyValue({
    namespace: "data_studio",
    key: "isNavbarOpened",
  });
  const isNavbarOpened = _isNavbarOpened !== false;

  const { pathname } = useSelector(getLocation);
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

  const currentTab = getCurrentTab(pathname);

  const upperNav = (
    <>
      <SpaceTab
        label={t`Library`}
        icon="repository"
        to={Urls.dataStudioLibrary()}
        isSelected={currentTab === "library"}
        showLabel={isNavbarOpened}
        isGated={!hasLibraryFeature}
        rightSection={
          hasDirtyChanges && PLUGIN_REMOTE_SYNC.CollectionSyncStatusBadge ? (
            <PLUGIN_REMOTE_SYNC.CollectionSyncStatusBadge />
          ) : null
        }
      />
      {canAccessDataModel && (
        <SpaceTab
          label={t`Tables`}
          icon="open_folder"
          to={Urls.dataStudioData()}
          isSelected={currentTab === "data"}
          showLabel={isNavbarOpened}
        />
      )}
      <SpaceTab
        label={t`Schema viewer`}
        icon="network"
        to={Urls.dataStudioSchemaViewer()}
        isSelected={currentTab === "schema-viewer"}
        showLabel={isNavbarOpened}
        isGated={!hasSchemaViewerFeature}
      />
      <SpaceTab
        label={t`Dependency graph`}
        icon="dependencies"
        to={Urls.dependencyGraph()}
        isSelected={currentTab === "dependencies"}
        showLabel={isNavbarOpened}
        isGated={!hasDependenciesFeature}
      />
      {canAccessTransforms && (
        <SpaceTab
          label={t`Transforms`}
          icon="transform"
          to={Urls.transformList()}
          isSelected={currentTab === "transforms"}
          showLabel={isNavbarOpened}
          rightSection={
            hasTransformDirtyChanges &&
            PLUGIN_REMOTE_SYNC.CollectionSyncStatusBadge ? (
              <PLUGIN_REMOTE_SYNC.CollectionSyncStatusBadge />
            ) : null
          }
        />
      )}
      <SpaceTab
        label={t`Glossary`}
        icon="glossary"
        to={Urls.dataStudioGlossary()}
        isSelected={currentTab === "glossary"}
        showLabel={isNavbarOpened}
      />
    </>
  );

  const lowerNav = (
    <>
      {hasRemoteSyncFeature ? (
        <PLUGIN_REMOTE_SYNC.GitSyncSetupMenuItem
          isNavbarOpened={isNavbarOpened}
          onClick={() => setIsGitSettingsOpen(true)}
        />
      ) : (
        <SpaceTab
          label={t`Set up remote sync`}
          icon="gear"
          to={Urls.dataStudioGitSync()}
          isSelected={currentTab === "git-sync"}
          showLabel={isNavbarOpened}
          isGated
        />
      )}
      {canManageWorkspaces && (
        <SpaceTab
          label={t`Workspaces`}
          icon="workspace"
          to={Urls.workspaces()}
          isSelected={currentTab === "workspaces"}
          showLabel={isNavbarOpened}
        />
      )}
      {canAccessTransforms && (
        <SpaceTab
          label={t`Jobs`}
          icon="clock"
          to={Urls.transformJobList()}
          isSelected={currentTab === "jobs"}
          showLabel={isNavbarOpened}
        />
      )}
      {canAccessTransforms && (
        <SpaceTab
          label={t`Runs`}
          icon="play_outlined"
          to={Urls.transformRunList()}
          isSelected={currentTab === "runs"}
          showLabel={isNavbarOpened}
        />
      )}
    </>
  );

  return (
    <SpaceLayout
      logo={
        <img
          alt={t`Data Studio Logo`}
          src={DataStudioLogo}
          width={32}
          height={32}
          style={{ display: "block" }}
        />
      }
      testId="data-studio-nav"
      isLoading={isLoadingNavbarKey}
      isNavbarOpened={isNavbarOpened}
      onNavbarToggle={setIsNavbarOpened}
      headerControls={<PLUGIN_REMOTE_SYNC.GitSyncAppBarControls />}
      upperNav={upperNav}
      lowerNav={lowerNav}
      navExtras={
        <PLUGIN_REMOTE_SYNC.GitSettingsModal
          isOpen={isGitSettingsOpen}
          onClose={() => setIsGitSettingsOpen(false)}
        />
      }
    >
      {children}
    </SpaceLayout>
  );
}
