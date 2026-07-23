import { useState } from "react";
import { t } from "ttag";

import DataStudioLogo from "assets/img/data-studio-logo.svg";
import { useHasTokenFeature, useSetting } from "metabase/common/hooks";
import { useUserKeyValue } from "metabase/common/hooks/use-user-key-value";
import { useDataStudioSettings } from "metabase/data-studio/settings/hooks";
import {
  AreaLayout,
  AreaTab,
  AreaTabGroup,
} from "metabase/nav/components/AreaLayout";
import {
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
  PLUGIN_REMOTE_SYNC,
  PLUGIN_WORKSPACES,
} from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { Outlet } from "metabase/router";
import { getLocation } from "metabase/selectors/routing";
import { canAccessTransforms as canAccessTransformsSelector } from "metabase/transforms/selectors";
import * as Urls from "metabase/urls";

import { getCurrentTab } from "./utils";

export function DataStudioLayout() {
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

  const isTransformsSetupComplete = useSetting("transforms-setup-complete");
  const areTransformsEnabled = useSetting("transforms-enabled");

  const canUseTransforms = canAccessTransforms && areTransformsEnabled;
  // if transform setup isn't complete, we still show transforms - that's where the upsell/enable pages are
  const shouldShowTransforms = canUseTransforms || !isTransformsSetupComplete;

  const settings = useDataStudioSettings();
  const currentTab = getCurrentTab(pathname);

  const upperNav = (
    <>
      <AreaTab
        label={t`Guide`}
        icon="book_open"
        to={Urls.dataStudioGuide()}
        isSelected={currentTab === "guide"}
        showLabel={isNavbarOpened}
      />

      <AreaTabGroup label={t`Data`} showLabel={isNavbarOpened}>
        {canAccessDataModel && (
          <AreaTab
            label={t`Connected data`}
            icon="database"
            to={Urls.dataStudioData()}
            isSelected={currentTab === "data"}
            showLabel={isNavbarOpened}
          />
        )}
        {shouldShowTransforms && (
          <AreaTab
            label={t`Data transformation`}
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
      </AreaTabGroup>

      <AreaTabGroup label={t`Library`} showLabel={isNavbarOpened}>
        <AreaTab
          label={t`Semantic layer`}
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
        <AreaTab
          label={t`Glossary`}
          icon="glossary"
          to={Urls.dataStudioGlossary()}
          isSelected={currentTab === "glossary"}
          showLabel={isNavbarOpened}
        />
      </AreaTabGroup>

      <AreaTabGroup label={t`Tools`} showLabel={isNavbarOpened}>
        <AreaTab
          label={t`Schema viewer`}
          icon="network"
          to={Urls.dataStudioSchemaViewer()}
          isSelected={currentTab === "schema-viewer"}
          showLabel={isNavbarOpened}
          isGated={!hasSchemaViewerFeature}
        />
        <AreaTab
          label={t`Dependency graph`}
          icon="dependencies"
          to={Urls.dependencyGraph()}
          isSelected={currentTab === "dependencies"}
          showLabel={isNavbarOpened}
          isGated={!hasDependenciesFeature}
        />
      </AreaTabGroup>
    </>
  );

  const lowerNav = (
    <>
      {hasRemoteSyncFeature ? (
        <>
          <PLUGIN_REMOTE_SYNC.GitSyncSetupMenuItem
            isNavbarOpened={isNavbarOpened}
            onClick={() => setIsGitSettingsOpen(true)}
          />
          <PLUGIN_REMOTE_SYNC.GitSettingsModal
            isOpen={isGitSettingsOpen}
            onClose={() => setIsGitSettingsOpen(false)}
          />
        </>
      ) : (
        <AreaTab
          label={t`Remote sync`}
          icon="git_branch"
          to={Urls.dataStudioGitSync()}
          isSelected={currentTab === "git-sync"}
          showLabel={isNavbarOpened}
          isGated
        />
      )}
      {canManageWorkspaces && (
        <AreaTab
          label={t`Workspaces`}
          icon="workspace"
          to={Urls.workspaces()}
          isSelected={currentTab === "workspaces"}
          showLabel={isNavbarOpened}
        />
      )}
      {settings.length > 0 && (
        <AreaTab
          label={t`Settings`}
          icon="gear"
          to={Urls.dataStudioSettings()}
          isSelected={currentTab === "settings"}
          showLabel={isNavbarOpened}
        />
      )}
    </>
  );

  return (
    <AreaLayout
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
    >
      <Outlet />
    </AreaLayout>
  );
}
