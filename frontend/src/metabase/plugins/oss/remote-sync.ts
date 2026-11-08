import type { ComponentType } from "react";

import type { CollectionTreeItem } from "metabase/common/collections/utils";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type { State } from "metabase/redux/store";
import type { CollectionId, RemoteSyncEntity } from "metabase-types/api";

import { definePluginSlot } from "../slot";

export type CollectionsNavTreeProps = {
  collections: CollectionTreeItem[];
  selectedId?: number | string;
  onSelect?: (item: ITreeNodeItem) => void;
};

export type RemoteSyncSettingsModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export type RemoteSyncSetupMenuItemProps = {
  isNavbarOpened: boolean;
  onClick: () => void;
};

export type RemoteSyncDirtyAreas = {
  library: boolean;
  transforms: boolean;
  snippets: boolean;
  dataActions: boolean;
  glossary: boolean;
};

export type RemoteSyncDirtyState = {
  dirty: RemoteSyncEntity[];
  areas: RemoteSyncDirtyAreas;
  isCollectionDirty: (collectionId: CollectionId | undefined) => boolean;
};

const NO_DIRTY_STATE: RemoteSyncDirtyState = {
  dirty: [],
  areas: {
    library: false,
    transforms: false,
    snippets: false,
    dataActions: false,
    glossary: false,
  },
  isCollectionDirty: () => false,
};

type PluginRemoteSync = {
  isEnabled: boolean;
  SettingsPage: ComponentType;
  SettingsNavItem: ComponentType;
  SettingsModal: ComponentType<RemoteSyncSettingsModalProps>;
  SetupMenuItem: ComponentType<RemoteSyncSetupMenuItemProps>;
  AppBarControls: ComponentType;
  TaskStatus: ComponentType;
  CollectionsNavTree: ComponentType<CollectionsNavTreeProps> | null;
  CollectionSyncStatusBadge: ComponentType | null;
  getIsRemoteSyncReadOnly: (state: State) => boolean;
  useIsRemoteSyncVisible: () => boolean;
  useRemoteSyncDirtyState: () => RemoteSyncDirtyState;
};

const getDefaultPluginRemoteSync = (): PluginRemoteSync => ({
  isEnabled: false,
  SettingsPage: PluginPlaceholder,
  SettingsNavItem: PluginPlaceholder,
  SettingsModal: PluginPlaceholder,
  SetupMenuItem: PluginPlaceholder,
  AppBarControls: PluginPlaceholder,
  TaskStatus: PluginPlaceholder,
  CollectionsNavTree: null,
  CollectionSyncStatusBadge: null,
  getIsRemoteSyncReadOnly: () => false,
  useIsRemoteSyncVisible: () => false,
  useRemoteSyncDirtyState: () => NO_DIRTY_STATE,
});

export const PLUGIN_REMOTE_SYNC = definePluginSlot(getDefaultPluginRemoteSync);
