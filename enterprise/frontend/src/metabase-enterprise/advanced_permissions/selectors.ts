import type { State } from "metabase/redux/store";
import type { DatabaseId, GroupId } from "metabase-types/api";

import type { AdvancedPermissionsStoreState } from "./types";

const getPluginState = (state: State) =>
  // the plugin slice is registered by initializePlugin, so it is present
  // whenever these selectors run
  (state as AdvancedPermissionsStoreState).plugins.advancedPermissionsPlugin;

export const getImpersonation =
  (databaseId: DatabaseId, groupId: GroupId) => (state: State) =>
    getPluginState(state).impersonations.find(
      (impersonation) =>
        impersonation.db_id === databaseId &&
        impersonation.group_id === groupId,
    );

export const getImpersonations = (state: State) =>
  getPluginState(state).impersonations;
