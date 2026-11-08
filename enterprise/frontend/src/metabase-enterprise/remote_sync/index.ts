import { PLUGIN_REDUX_MIDDLEWARES, PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { AppBarControls } from "./components/AppBarControls";
import { CollectionSyncStatusBadge } from "./components/CollectionSyncStatusBadge";
import { CollectionsNavTree } from "./components/CollectionsNavTree";
import { SettingsModal } from "./components/SettingsModal";
import { SettingsNavItem } from "./components/SettingsNavItem";
import { SettingsPage } from "./components/SettingsPage";
import { SetupMenuItem } from "./components/SetupMenuItem";
import { TaskStatus } from "./components/TaskStatus";
import { useIsRemoteSyncVisible, useRemoteSyncDirtyState } from "./hooks";
import { remoteSyncListenerMiddleware } from "./middleware";
import { getIsRemoteSyncReadOnly } from "./selectors";

export function initializePlugin() {
  if (hasPremiumFeature("remote_sync")) {
    PLUGIN_REMOTE_SYNC.isEnabled = true;
    PLUGIN_REMOTE_SYNC.SettingsPage = SettingsPage;
    PLUGIN_REMOTE_SYNC.SettingsNavItem = SettingsNavItem;
    PLUGIN_REMOTE_SYNC.SettingsModal = SettingsModal;
    PLUGIN_REMOTE_SYNC.SetupMenuItem = SetupMenuItem;
    PLUGIN_REMOTE_SYNC.AppBarControls = AppBarControls;
    PLUGIN_REMOTE_SYNC.TaskStatus = TaskStatus;
    PLUGIN_REMOTE_SYNC.CollectionsNavTree = CollectionsNavTree;
    PLUGIN_REMOTE_SYNC.CollectionSyncStatusBadge = CollectionSyncStatusBadge;
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly = getIsRemoteSyncReadOnly;
    PLUGIN_REMOTE_SYNC.useIsRemoteSyncVisible = useIsRemoteSyncVisible;
    PLUGIN_REMOTE_SYNC.useRemoteSyncDirtyState = useRemoteSyncDirtyState;
    PLUGIN_REDUX_MIDDLEWARES.push(remoteSyncListenerMiddleware.middleware);
  }
}
