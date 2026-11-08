import type { State } from "metabase/redux/store";

import { definePluginSlot } from "../slot";

type PluginRemoteSync = {
  getIsRemoteSyncReadOnly: (state: State) => boolean;
};

const getDefaultPluginRemoteSync = (): PluginRemoteSync => ({
  getIsRemoteSyncReadOnly: () => false,
});

export const PLUGIN_REMOTE_SYNC = definePluginSlot(getDefaultPluginRemoteSync);
