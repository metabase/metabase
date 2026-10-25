import type {
  AppliedDataPermissionUpdate,
  DataPermissionsDrafts,
} from "metabase/plugins";
import {
  DataPermission,
  DataPermissionValue,
  type GroupId,
  type Impersonation,
} from "metabase-types/api";

const isSameImpersonation = (a: Impersonation, b: Impersonation) =>
  a.db_id === b.db_id && a.group_id === b.group_id;

export const setImpersonationDraft =
  (impersonation: Impersonation) =>
  (drafts: DataPermissionsDrafts): DataPermissionsDrafts => ({
    ...drafts,
    impersonations: [
      ...drafts.impersonations.filter(
        (draft) => !isSameImpersonation(draft, impersonation),
      ),
      impersonation,
    ],
  });

export const getImpersonationDraft = (
  drafts: DataPermissionsDrafts,
  databaseId: number,
  groupId: GroupId,
) =>
  drafts.impersonations.find(
    (impersonation) =>
      impersonation.db_id === databaseId && impersonation.group_id === groupId,
  );

export const removeChangedImpersonationDrafts = (
  drafts: DataPermissionsDrafts,
  { groupId, entityId, permission, value }: AppliedDataPermissionUpdate,
): DataPermissionsDrafts => {
  if (
    value === DataPermissionValue.IMPERSONATED ||
    permission !== DataPermission.VIEW_DATA
  ) {
    return drafts;
  }

  return {
    ...drafts,
    impersonations: drafts.impersonations.filter(
      (impersonation) =>
        impersonation.group_id !== groupId &&
        impersonation.db_id !== entityId.databaseId,
    ),
  };
};
