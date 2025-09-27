import { PLUGIN_GIT_SYNC } from "metabase/plugins";

import { GitSyncSettings } from "./GitSyncSettings";
import { LibraryNav } from "./LibraryNav";
import { SyncedCollectionsSidebarSection } from "./SyncedCollectionsSidebarSection";

// TODO: use a token feature flag
PLUGIN_GIT_SYNC.GitSyncSettings = GitSyncSettings;
PLUGIN_GIT_SYNC.LibraryNav = LibraryNav;
PLUGIN_GIT_SYNC.SyncedCollectionsSidebarSection =
  SyncedCollectionsSidebarSection;
