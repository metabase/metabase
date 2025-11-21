import type { TagDescription } from "@reduxjs/toolkit/query";
import type { ComponentType, ReactNode } from "react";

import {
  NotFoundPlaceholder,
  PluginPlaceholder,
} from "metabase/plugins/components/PluginPlaceholder";

import type { SyncedCollectionsSidebarSectionProps } from "../types";

const getDefaultPluginRemoteSync = () => ({
  LibraryNav: PluginPlaceholder,
  RemoteSyncSettings: NotFoundPlaceholder,
  SyncedCollectionsSidebarSection: PluginPlaceholder,
  REMOTE_SYNC_INVALIDATION_TAGS: null,
  useSyncStatus: () => ({
    isIdle: true,
    taskType: null,
    progress: 0,
    message: "",
    progressModal: null,
  }),
});

export const PLUGIN_REMOTE_SYNC: {
  LibraryNav: ComponentType;
  RemoteSyncSettings: ComponentType;
  SyncedCollectionsSidebarSection: ComponentType<SyncedCollectionsSidebarSectionProps>;
  REMOTE_SYNC_INVALIDATION_TAGS: TagDescription<any>[] | null;
  useSyncStatus: () => {
    isIdle: boolean;
    taskType: any;
    progress: number;
    message: string;
    progressModal: ReactNode;
  };
} = getDefaultPluginRemoteSync();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_REMOTE_SYNC, getDefaultPluginRemoteSync());
}
