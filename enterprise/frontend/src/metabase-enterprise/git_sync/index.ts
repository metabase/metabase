import { PLUGIN_GIT_SYNC } from "metabase/plugins";

import { GitSyncSettings } from "./GitSyncSettings";
import { LibraryNav } from "./LibraryNav";
import { SyncStatusBanner } from "./SyncStatusBanner";

PLUGIN_GIT_SYNC.GitSyncSettings = GitSyncSettings;
PLUGIN_GIT_SYNC.LibraryNav = LibraryNav;
PLUGIN_GIT_SYNC.SyncStatusBanner = SyncStatusBanner;
