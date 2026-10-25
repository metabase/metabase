import _ from "underscore";

import type {
  AppliedDataPermissionUpdate,
  DataPermissionsDrafts,
  GroupTableAccessPolicy,
} from "metabase-types/api";
import { DataPermission, DataPermissionValue } from "metabase-types/api";

import { getPolicyKey, getPolicyKeyFromParams } from "./utils";

export const setSandboxDraft =
  (policy: GroupTableAccessPolicy) =>
  (drafts: DataPermissionsDrafts): DataPermissionsDrafts => ({
    ...drafts,
    sandboxes: { ...drafts.sandboxes, [getPolicyKey(policy)]: policy },
  });

export const removeUnsandboxedDrafts = (
  drafts: DataPermissionsDrafts,
  {
    entityId,
    database,
    groupId,
    value,
    permission,
  }: AppliedDataPermissionUpdate,
): DataPermissionsDrafts => {
  if (entityId.tableId != null) {
    const isUnsandboxingTable =
      permission === DataPermission.VIEW_DATA &&
      value !== DataPermissionValue.SANDBOXED;

    return isUnsandboxingTable
      ? {
          ...drafts,
          sandboxes: _.omit(
            drafts.sandboxes,
            getPolicyKeyFromParams({ groupId, tableId: entityId.tableId }),
          ),
        }
      : drafts;
  }

  const policyKeys = (database.tables ?? [])
    .filter(
      (table) => !entityId.schemaName || table.schema === entityId.schemaName,
    )
    .map((table) => getPolicyKeyFromParams({ groupId, tableId: table.id }));

  return { ...drafts, sandboxes: _.omit(drafts.sandboxes, policyKeys) };
};
