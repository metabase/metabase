import type { DatabaseId, GroupId } from "metabase-types/api";

import type { AdvancedPermissionsStoreState } from "./types";

export const getImpersonation =
  (databaseId: DatabaseId, groupId: GroupId) =>
  (state: AdvancedPermissionsStoreState) =>
    state.plugins.advancedPermissionsPlugin.impersonations.find(
      impersonation =>
        impersonation.db_id === databaseId &&
        impersonation.group_id === groupId,
    );

export const getImpersonations = (state: AdvancedPermissionsStoreState) =>
  state.plugins.advancedPermissionsPlugin.impersonations;
