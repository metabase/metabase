import type {
  BaseQueryFn,
  QueryDefinition,
  TagDescription,
} from "@reduxjs/toolkit/query";
import type { ComponentType, ReactNode } from "react";

import type { TagType } from "metabase/api/tags";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import type { CollectionTreeItem } from "metabase/entities/collections";
import type { UseQuery } from "metabase/entities/containers/rtk-query/types/rtk";
import type {
  GitSyncSetupMenuItemProps,
  SyncedCollectionsSidebarSectionProps,
} from "metabase/plugins";
import {
  NotFoundPlaceholder,
  PluginPlaceholder,
} from "metabase/plugins/components/PluginPlaceholder";
import type {
  RemoteSyncChangesResponse,
  RemoteSyncEntity,
} from "metabase-types/api";
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
  refetch: ReturnType<
    UseQuery<
      QueryDefinition<void, BaseQueryFn, TagType, RemoteSyncChangesResponse>
    >
  >["refetch"];
}

const getDefaultPluginRemoteSync = () => ({
  isEnabled: false,
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
  useRemoteSyncDirtyState: () =>
    ({
      isCollectionDirty: false,
    }) as unknown as RemoteSyncDirtyState,
});

export const PLUGIN_REMOTE_SYNC: {
  isEnabled: boolean;
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
  useRemoteSyncDirtyState: () => RemoteSyncDirtyState;
} = getDefaultPluginRemoteSync();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_REMOTE_SYNC, getDefaultPluginRemoteSync());
}
