import type { ComponentType } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type { State } from "metabase/redux/store";
import type { CollectionId, TransformId } from "metabase-types/api";

import { definePluginSlot } from "../slot";

export type RemoteSyncSettingsModalProps = {
  opened: boolean;
  onClose: () => void;
};

export type RemoteSyncSetupMenuItemProps = {
  isNavbarOpened: boolean;
  onClick: () => void;
};

export type RemoteSyncChangesArea =
  | "library"
  | "transforms"
  | "python-library"
  | "snippets"
  | "data-actions"
  | "glossary";

export type RemoteSyncChangesTarget =
  | { type: "area"; area: RemoteSyncChangesArea }
  | { type: "collection"; id: CollectionId }
  | { type: "transform"; id: TransformId };

export type RemoteSyncChangesBadgeProps = {
  target: RemoteSyncChangesTarget;
};

type PluginRemoteSync = {
  isEnabled: boolean;
  SettingsNavItem: ComponentType;
  SettingsPage: ComponentType;
  SettingsModal: ComponentType<RemoteSyncSettingsModalProps>;
  SetupMenuItem: ComponentType<RemoteSyncSetupMenuItemProps>;
  AppBarControls: ComponentType;
  ChangesBadge: ComponentType<RemoteSyncChangesBadgeProps>;
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
  ChangesBadge: PluginPlaceholder,
  getIsRemoteSyncReadOnly: () => false,
  getIsRemoteSyncVisible: () => false,
});

export const PLUGIN_REMOTE_SYNC = definePluginSlot(getDefaultPluginRemoteSync);
