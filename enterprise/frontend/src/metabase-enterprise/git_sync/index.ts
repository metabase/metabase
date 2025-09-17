import { PLUGIN_GIT_SYNC } from "metabase/plugins";

import { GitSyncSettings } from "./GitSyncSettings";
import { LibraryDevModeBanner } from "./LibraryDevModeBanner";
import { LibraryNav } from "./LibraryNav";
import { LibrarySyncControl } from "./LibrarySyncControl";

PLUGIN_GIT_SYNC.GitSyncSettings = GitSyncSettings;
PLUGIN_GIT_SYNC.LibraryNav = LibraryNav;
PLUGIN_GIT_SYNC.LibrarySyncControl = LibrarySyncControl;
PLUGIN_GIT_SYNC.LibraryDevModeBanner = LibraryDevModeBanner;
