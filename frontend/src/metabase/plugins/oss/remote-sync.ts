import type { TagDescription } from "@reduxjs/toolkit/query";
import type { ComponentType, ReactNode } from "react";

import type { CollectionTreeItem } from "metabase/common/collections/utils";
import type {
  EntityPickerOptions,
  OmniPickerCollectionItem,
  OmniPickerFolderItem,
  OmniPickerItem,
} from "metabase/common/components/Pickers";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import type {
  GitSyncSetupMenuItemProps,
  SyncedCollectionsSidebarSectionProps,
} from "metabase/plugins";
import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type { DispatchFn } from "metabase/redux";
import type { State } from "metabase/redux/store";
import type {
  Collection,
  RemoteSyncEntity,
  RemoteSyncWorktreeId,
} from "metabase-types/api";

export type CollectionsNavTreeProps = {
  collections: CollectionTreeItem[];
  selectedId?: number | string;
  onSelect?: (item: ITreeNodeItem) => void;
};

export type WorktreesSidebarSectionProps = {
  onItemSelect: () => void;
  selectedId?: number | string;
};

export type WorktreeSwitcherProps = {
  value: RemoteSyncWorktreeId | null;
  onChange: (worktreeId: RemoteSyncWorktreeId | null) => void;
};

export interface GitSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface RemoteSyncDirtyState {
  /** Array of all dirty entities */
  dirty: RemoteSyncEntity[];
  /** Map of collection IDs that have dirty child entities */
  changedCollections: Record<number, boolean>;
  /** Whether any dirty changes exist globally */
  isDirty: boolean;
  /** Whether any entities have "removed" status */
  hasRemovedItems: boolean;
  /** Whether data is loading */
  isLoading: boolean;
  /** Check if a specific collection has dirty items */
  isCollectionDirty: (collectionId: number | string | undefined) => boolean;
  /** Check if any collection in a set has dirty items */
  hasAnyCollectionDirty: (collectionIds: Set<number> | number[]) => boolean;
  /** Check if any dirty entity (including collections) is in the given set of IDs */
  hasDirtyInCollectionTree: (collectionIds: Set<number>) => boolean;
  /** Refetch the dirty state data */
  refetch: () => unknown;
}

const getDefaultPluginRemoteSync = () => ({
  isEnabled: false,
  LibraryNav: PluginPlaceholder,
  RemoteSyncSettings: PluginPlaceholder,
  SyncedCollectionsSidebarSection: PluginPlaceholder,
  WorktreesSidebarSection: PluginPlaceholder,
  WorktreeSwitcher: PluginPlaceholder,
  // Unjustified type cast. FIXME
  GitSyncAppBarControls: PluginPlaceholder as ComponentType,
  // Unjustified type cast. FIXME
  GitSettingsModal: PluginPlaceholder as ComponentType<GitSettingsModalProps>,
  GitSyncSetupMenuItem: PluginPlaceholder,
  // Unjustified type cast. FIXME
  CollectionsNavTree: null as ComponentType<CollectionsNavTreeProps> | null,
  // Unjustified type cast. FIXME
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
  useRemoteSyncDirtyState: () =>
    // Unjustified type cast. FIXME
    ({
      isCollectionDirty: false,
    }) as unknown as RemoteSyncDirtyState,
  // Entity-picker "Worktrees" section (remote sync is enterprise-only, so OSS shows nothing)
  useWorktreesPickerRootItem: (
    _options: EntityPickerOptions,
  ): OmniPickerCollectionItem | null => null,
  isWorktreesRootItem: (_item: OmniPickerItem) => false,
  isWorktreeFolderItem: (_item: OmniPickerItem) => false,
  WorktreesItemList: PluginPlaceholder,
  WorktreeCollectionsItemList: PluginPlaceholder,
  getWorktreePickerBasePath: (_args: {
    collection: Collection;
    dispatch: DispatchFn;
  }): Promise<OmniPickerCollectionItem[] | null> => Promise.resolve(null),
});

export const PLUGIN_REMOTE_SYNC: {
  isEnabled: boolean;
  LibraryNav: ComponentType;
  RemoteSyncSettings: ComponentType;
  SyncedCollectionsSidebarSection: ComponentType<SyncedCollectionsSidebarSectionProps>;
  WorktreesSidebarSection: ComponentType<WorktreesSidebarSectionProps>;
  WorktreeSwitcher: ComponentType<WorktreeSwitcherProps>;
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
  useRemoteSyncDirtyState: () => RemoteSyncDirtyState;
  /** The "Worktrees" root item for the entity picker, or null when worktrees shouldn't be offered. */
  useWorktreesPickerRootItem: (
    options: EntityPickerOptions,
  ) => OmniPickerCollectionItem | null;
  isWorktreesRootItem: (item: OmniPickerItem) => boolean;
  isWorktreeFolderItem: (item: OmniPickerItem) => boolean;
  WorktreesItemList: ComponentType<{ pathIndex: number }>;
  WorktreeCollectionsItemList: ComponentType<{
    parentItem: OmniPickerFolderItem;
    pathIndex: number;
  }>;
  /**
   * Picker path prefix for a collection inside a worktree — the "Worktrees" root, the worktree's
   * folder, and the worktree's root-level ancestor — or null when the worktree can't be resolved.
   */
  getWorktreePickerBasePath: (args: {
    collection: Collection;
    dispatch: DispatchFn;
  }) => Promise<OmniPickerCollectionItem[] | null>;
} = getDefaultPluginRemoteSync();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_REMOTE_SYNC, getDefaultPluginRemoteSync());
}
