import { t } from "ttag";

import type { ConfirmationState } from "metabase/hooks/use-confirmation";
import type { Member } from "metabase-types/api";
import type { User } from "metabase-types/api/user";
import type { AdminPath, AdminPathKey } from "metabase-types/store";

import type { UserWithGroupManagerPermission } from "./types/user";

const REVOKE_MANAGING_CONFIRMATION = {
  title: t`Are you sure?`,
  message: t`You will not be able to manage users of this group anymore.`,
};

const canAccessPeople = (user?: UserWithGroupManagerPermission) =>
  user?.permissions?.is_group_manager ?? false;

export const groupManagerAllowedPathGetter = (
  user?: UserWithGroupManagerPermission,
): AdminPathKey[] => {
  return canAccessPeople(user) ? ["people"] : [];
};

export const getRevokedAllGroupManagersPath = (adminPaths: AdminPath[]) => {
  const allowedItems = adminPaths.filter(item => item.key !== "people");

  return allowedItems.length > 0 ? allowedItems[0].path : "/";
};

export const getRevokeManagerPeopleRedirect = (
  currentUserMemberships: Member[],
  adminPaths: AdminPath[],
) => {
  const isRemovingLastManagerMembership =
    currentUserMemberships.filter(m => m.is_group_manager).length === 1;

  if (isRemovingLastManagerMembership) {
    return getRevokedAllGroupManagersPath(adminPaths);
  }

  return null;
};

export const getRevokeManagerGroupsRedirect = (
  currentUserMemberships: Member[],
  adminPaths: AdminPath[],
) => {
  const isRemovingLastManagerMembership =
    currentUserMemberships.filter(m => m.is_group_manager).length === 1;

  if (!isRemovingLastManagerMembership) {
    return "/admin/people/groups";
  }

  return getRevokedAllGroupManagersPath(adminPaths);
};

export const getRemoveMembershipConfirmation = (
  currentUser: User,
  currentUserMemberships: Member[],
  deletedMembershipId: number,
): Partial<ConfirmationState> | null => {
  const isRemovingSelf =
    currentUserMemberships.find(
      membership => membership.membership_id === deletedMembershipId,
    ) != null;

  return isRemovingSelf && !currentUser.is_superuser
    ? REVOKE_MANAGING_CONFIRMATION
    : null;
};

export const getChangeMembershipConfirmation = (
  currentUser: User,
  updatedMembership: Member,
): Partial<ConfirmationState> | null => {
  const isRevokingFromSelf =
    updatedMembership.user_id === currentUser.id &&
    !updatedMembership.is_group_manager;

  return isRevokingFromSelf && !currentUser.is_superuser
    ? REVOKE_MANAGING_CONFIRMATION
    : null;
};
