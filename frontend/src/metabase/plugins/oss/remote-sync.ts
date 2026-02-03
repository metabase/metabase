import type { TagDescription } from "@reduxjs/toolkit/query";
import type { ComponentType, ReactNode } from "react";

import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import type { CollectionTreeItem } from "metabase/entities/collections";
import type {
  GitSyncSetupMenuItemProps,
  SyncedCollectionsSidebarSectionProps,
} from "metabase/plugins";
import {
  NotFoundPlaceholder,
  PluginPlaceholder,
} from "metabase/plugins/components/PluginPlaceholder";
import type { State } from "metabase-types/store";

export type CollectionsNavTreeProps = {
  collections: CollectionTreeItem[];
  selectedId?: number | string;
  onSelect?: (item: ITreeNodeItem) => void;
};

export interface GitSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const getDefaultPluginRemoteSync = () => ({
  LibraryNav: PluginPlaceholder,
  RemoteSyncSettings: NotFoundPlaceholder,
  SyncedCollectionsSidebarSection: PluginPlaceholder,
  GitSyncAppBarControls: PluginPlaceholder as ComponentType,
  GitSettingsModal: PluginPlaceholder as ComponentType<GitSettingsModalProps>,
  GitSyncSetupMenuItem: PluginPlaceholder,
  CollectionsNavTree: null as ComponentType<CollectionsNavTreeProps> | null,
  CollectionSyncStatusBadge: null as ComponentType | null,
  REMOTE_SYNC_INVALIDATION_TAGS: null,
  useSyncStatus: () => ({
    isIdle: true,
    taskType: null,
    progress: 0,
    message: "",
    progressModal: null,
  }),
  useGitSyncVisible: () => ({ isVisible: false, currentBranch: null }),
  useHasLibraryDirtyChanges: () => false,
  useHasTransformDirtyChanges: () => false,
  getIsRemoteSyncReadOnly: () => false,
});

export const PLUGIN_REMOTE_SYNC: {
  LibraryNav: ComponentType;
  RemoteSyncSettings: ComponentType;
  SyncedCollectionsSidebarSection: ComponentType<SyncedCollectionsSidebarSectionProps>;
  GitSyncAppBarControls: ComponentType;
  GitSettingsModal: ComponentType<GitSettingsModalProps>;
  GitSyncSetupMenuItem: ComponentType<GitSyncSetupMenuItemProps>;
  CollectionsNavTree: ComponentType<CollectionsNavTreeProps> | null;
  CollectionSyncStatusBadge: ComponentType | null;
  REMOTE_SYNC_INVALIDATION_TAGS: TagDescription<string>[] | null;
  useSyncStatus: () => {
    isIdle: boolean;
    taskType: any;
    progress: number;
    message: string;
    progressModal: ReactNode;
  };
  useGitSyncVisible: () => {
    isVisible: boolean;
    currentBranch: string | null | undefined;
  };
  useHasLibraryDirtyChanges: () => boolean;
  useHasTransformDirtyChanges: () => boolean;
  getIsRemoteSyncReadOnly: (state: State) => boolean;
} = getDefaultPluginRemoteSync();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_REMOTE_SYNC, getDefaultPluginRemoteSync());
}
