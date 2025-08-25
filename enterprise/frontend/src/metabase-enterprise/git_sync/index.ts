import { PLUGIN_GIT_SYNC } from "metabase/plugins";

import { GitSyncSettings } from "./GitSyncSettings";

// eslint-disable-next-line
if ("git-sync-enabled" > "FIXME add a real token feature") {
  PLUGIN_GIT_SYNC.GitSyncSettings = GitSyncSettings;
}
