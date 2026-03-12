import { t } from "ttag";

import type { ConfirmationState } from "metabase/common/hooks/use-confirmation";
import type { Member, Membership, User } from "metabase-types/api";
import type { AdminPath, AdminPathKey } from "metabase-types/store";

const REVOKE_MANAGING_CONFIRMATION = {
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  title: t`Are you sure?`,
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  message: t`You will not be able to manage users of this group anymore.`,
};

const canAccessPeople = (user?: User) =>
  user?.permissions?.is_group_manager ?? false;

export const groupManagerAllowedPathGetter = (user?: User): AdminPathKey[] => {
  return canAccessPeople(user) ? ["people"] : [];
};

export const getRevokedAllGroupManagersPath = (adminPaths: AdminPath[]) => {
  const allowedItems = adminPaths.filter((item) => item.key !== "people");

  return allowedItems.length > 0 ? allowedItems[0].path : "/";
};

export const getRevokeManagerPeopleRedirect = (
  currentUserMemberships: Member[],
  adminPaths: AdminPath[],
) => {
  const isRemovingLastManagerMembership =
    currentUserMemberships.filter((m) => m.is_group_manager).length === 1;

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
    currentUserMemberships.filter((m) => m.is_group_manager).length === 1;

  if (!isRemovingLastManagerMembership) {
    return "/admin/people/groups";
  }

  return getRevokedAllGroupManagersPath(adminPaths);
};

export const getRemoveMembershipConfirmation = (
  currentUser: User,
  currentUserMemberships: Membership[],
  deletedMembershipId: number,
): Pick<ConfirmationState, "title" | "message"> | null => {
  const isRemovingSelf =
    currentUserMemberships.find(
      (membership) => membership.membership_id === deletedMembershipId,
    ) != null;

  return isRemovingSelf && !currentUser.is_superuser
    ? REVOKE_MANAGING_CONFIRMATION
    : null;
};

export const getChangeMembershipConfirmation = (
  currentUser: User,
  updatedMembership: Membership,
): Pick<ConfirmationState, "title" | "message"> | null => {
  const isRevokingFromSelf =
    updatedMembership.user_id === currentUser.id &&
    !updatedMembership.is_group_manager;

  return isRevokingFromSelf && !currentUser.is_superuser
    ? REVOKE_MANAGING_CONFIRMATION
    : null;
};
