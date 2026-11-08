import type { ComponentType } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type { State } from "metabase/redux/store";

import { definePluginSlot } from "../slot";

export type RemoteSyncSettingsModalProps = {
  opened: boolean;
  onClose: () => void;
};

export type RemoteSyncSetupMenuItemProps = {
  isNavbarOpened: boolean;
  onClick: () => void;
};

type PluginRemoteSync = {
  isEnabled: boolean;
  SettingsNavItem: ComponentType;
  SettingsPage: ComponentType;
  SettingsModal: ComponentType<RemoteSyncSettingsModalProps>;
  SetupMenuItem: ComponentType<RemoteSyncSetupMenuItemProps>;
  AppBarControls: ComponentType;
  getIsRemoteSyncReadOnly: (state: State) => boolean;
  getIsRemoteSyncVisible: (state: State) => boolean;
};

const getDefaultPluginRemoteSync = (): PluginRemoteSync => ({
  isEnabled: false,
  SettingsNavItem: PluginPlaceholder,
  SettingsPage: PluginPlaceholder,
  SettingsModal: PluginPlaceholder,
  SetupMenuItem: PluginPlaceholder,
  AppBarControls: PluginPlaceholder,
  getIsRemoteSyncReadOnly: () => false,
  getIsRemoteSyncVisible: () => false,
});

export const PLUGIN_REMOTE_SYNC = definePluginSlot(getDefaultPluginRemoteSync);
