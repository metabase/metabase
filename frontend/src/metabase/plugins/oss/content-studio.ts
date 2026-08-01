import { type ComponentType, Fragment, type ReactNode } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type { CollectionId, RemoteSyncWorktreeId } from "metabase-types/api";

export type ContentStudioProviderProps = {
  children: ReactNode;
};

export type BranchEntityType = "dashboard" | "document";

export type BranchEntityBannerProps = {
  entityType: BranchEntityType;
  worktreeId: RemoteSyncWorktreeId;
  collectionId: CollectionId | null;
};

export type ContentStudioSidebarProps = {
  isNavbarOpened: boolean;
};

export type ContentStudioSyncControlsProps = {
  isNavbarOpened: boolean;
};

type ContentStudioPlugin = {
  isEnabled: boolean;
  getContentStudioContentRoutes: () => ReactNode;
  /** Wraps the whole studio, so the sidebar and the content pane share a scope. */
  ContentStudioProvider: ComponentType<ContentStudioProviderProps>;
  ContentStudioSidebar: ComponentType<ContentStudioSidebarProps>;
  /** Pull, push and the unsynced-changes indicator for the branch on screen. */
  ContentStudioSyncControls: ComponentType<ContentStudioSyncControlsProps>;
  /**
   * The collection a question sitting in `collectionId` must be saved into,
   * which also hides the save modal's collection picker. Set only when
   * `collectionId` is checked out on a branch: the general picker lists the main
   * branch alone, so leaving it unlocked would silently move the question there.
   */
  useSaveTargetCollectionId: (
    collectionId: CollectionId | null | undefined,
  ) => CollectionId | undefined;
  /**
   * Names the branch an entity is checked out on. Rendered by the main app pages
   * that host branch content — dashboards and documents — and only for an entity
   * that carries a worktree.
   */
  BranchEntityBanner: ComponentType<BranchEntityBannerProps>;
};

const getDefaultPluginContentStudio = (): ContentStudioPlugin => ({
  isEnabled: false,
  getContentStudioContentRoutes: () => null,
  ContentStudioProvider: Fragment,
  ContentStudioSidebar: PluginPlaceholder<ContentStudioSidebarProps>,
  ContentStudioSyncControls: PluginPlaceholder<ContentStudioSyncControlsProps>,
  useSaveTargetCollectionId: () => undefined,
  BranchEntityBanner: PluginPlaceholder<BranchEntityBannerProps>,
});

export const PLUGIN_CONTENT_STUDIO = getDefaultPluginContentStudio();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_CONTENT_STUDIO, getDefaultPluginContentStudio());
}
