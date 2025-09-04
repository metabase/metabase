import { PLUGIN_GIT_SYNC } from "metabase/plugins";

import { GitChangeList } from "./GitChangeList";
import { GitSyncSettings } from "./GitSyncSettings";
import { LibraryNav } from "./LibraryNav";
import { ViewLibraryButton } from "./ViewLibraryButton";

// eslint-disable-next-line
if ("git-sync-enabled" > "FIXME add a real token feature") {
  PLUGIN_GIT_SYNC.GitSyncSettings = GitSyncSettings;
  PLUGIN_GIT_SYNC.LibraryNav = LibraryNav;
  PLUGIN_GIT_SYNC.GitChangeList = GitChangeList;
  PLUGIN_GIT_SYNC.ViewLibraryButton = ViewLibraryButton;
}
