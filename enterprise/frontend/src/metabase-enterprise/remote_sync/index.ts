import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { AppBarControls } from "./components/AppBarControls";
import { ChangesBadge } from "./components/ChangesBadge";
import { SettingsModal } from "./components/SettingsModal";
import { SettingsNavItem } from "./components/SettingsNavItem";
import { SettingsPage } from "./components/SettingsPage";
import { SetupMenuItem } from "./components/SetupMenuItem";
import { getIsRemoteSyncReadOnly, getIsRemoteSyncVisible } from "./selectors";

export function initializePlugin() {
  if (hasPremiumFeature("remote_sync")) {
    PLUGIN_REMOTE_SYNC.isEnabled = true;
    PLUGIN_REMOTE_SYNC.SettingsNavItem = SettingsNavItem;
    PLUGIN_REMOTE_SYNC.SettingsPage = SettingsPage;
    PLUGIN_REMOTE_SYNC.SettingsModal = SettingsModal;
    PLUGIN_REMOTE_SYNC.SetupMenuItem = SetupMenuItem;
    PLUGIN_REMOTE_SYNC.AppBarControls = AppBarControls;
    PLUGIN_REMOTE_SYNC.ChangesBadge = ChangesBadge;
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly = getIsRemoteSyncReadOnly;
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncVisible = getIsRemoteSyncVisible;
  }
}
