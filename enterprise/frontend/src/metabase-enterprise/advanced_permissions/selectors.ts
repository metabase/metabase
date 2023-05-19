import { DatabaseId, GroupId } from "metabase-types/api";
import { State } from "metabase-types/store";
import { AdvancedPermissionsStoreState } from "./types";

export const getImpersonation =
  (databaseId: DatabaseId, groupId: GroupId) => (state: State) =>
    (
      state as AdvancedPermissionsStoreState
    ).plugins.advancedPermissionsPlugin.impersonations.find(
      impersonation =>
        impersonation.db_id === databaseId &&
        impersonation.group_id === groupId,
    );

export const getImpersonations = (state: State) =>
  (state as AdvancedPermissionsStoreState).plugins.advancedPermissionsPlugin
    .impersonations;
