import type { TagDescription } from "@reduxjs/toolkit/query";
import type { ComponentType, ReactNode } from "react";

import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import type { CollectionTreeItem } from "metabase/entities/collections";
import {
  NotFoundPlaceholder,
  PluginPlaceholder,
} from "metabase/plugins/components/PluginPlaceholder";

import type { SyncedCollectionsSidebarSectionProps } from "../types";

export type CollectionsNavTreeProps = {
  collections: CollectionTreeItem[];
  selectedId?: number | string;
  onSelect?: (item: ITreeNodeItem) => void;
};

export interface GitSyncAppBarControlsProps {
  fullWidth?: boolean;
}

export interface GitSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const getDefaultPluginRemoteSync = () => ({
  LibraryNav: PluginPlaceholder,
  RemoteSyncSettings: NotFoundPlaceholder,
  SyncedCollectionsSidebarSection: PluginPlaceholder,
  GitSyncAppBarControls:
    PluginPlaceholder as ComponentType<GitSyncAppBarControlsProps>,
  GitSettingsModal: PluginPlaceholder as ComponentType<GitSettingsModalProps>,
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
  useGitSettingsVisible: () => false,
  useHasLibraryDirtyChanges: () => false,
});

export const PLUGIN_REMOTE_SYNC: {
  LibraryNav: ComponentType;
  RemoteSyncSettings: ComponentType;
  SyncedCollectionsSidebarSection: ComponentType<SyncedCollectionsSidebarSectionProps>;
  GitSyncAppBarControls: ComponentType<GitSyncAppBarControlsProps>;
  GitSettingsModal: ComponentType<GitSettingsModalProps>;
  CollectionsNavTree: ComponentType<CollectionsNavTreeProps> | null;
  CollectionSyncStatusBadge: ComponentType | null;
  REMOTE_SYNC_INVALIDATION_TAGS: TagDescription<any>[] | null;
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
  useGitSettingsVisible: () => boolean;
  useHasLibraryDirtyChanges: () => boolean;
} = getDefaultPluginRemoteSync();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_REMOTE_SYNC, getDefaultPluginRemoteSync());
}
