import { PLUGIN_GIT_SYNC } from "metabase/plugins";

import { GitSyncSettings } from "./GitSyncSettings";
import { LibraryNav } from "./LibraryNav";
import { RemoteSyncReadOnlyBanner } from "./RemoteSyncReadOnlyBanner";

PLUGIN_GIT_SYNC.GitSyncSettings = GitSyncSettings;
PLUGIN_GIT_SYNC.LibraryNav = LibraryNav;
PLUGIN_GIT_SYNC.RemoteSyncReadOnlyBanner = RemoteSyncReadOnlyBanner;
