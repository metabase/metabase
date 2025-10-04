import { PLUGIN_GIT_SYNC } from "metabase/plugins";

import { GitSyncSettings } from "./GitSyncSettings";
import { LibraryNav } from "./LibraryNav";
import { SyncedCollectionsSidebarSection } from "./SyncedCollectionsSidebarSection";
import { getGitSyncInvalidationTags } from "./git-sync-cache-invalidation";

// TODO: use a token feature flag
PLUGIN_GIT_SYNC.GitSyncSettings = GitSyncSettings;
PLUGIN_GIT_SYNC.LibraryNav = LibraryNav;
PLUGIN_GIT_SYNC.SyncedCollectionsSidebarSection =
  SyncedCollectionsSidebarSection;
PLUGIN_GIT_SYNC.getGitSyncInvalidationTags = getGitSyncInvalidationTags;
