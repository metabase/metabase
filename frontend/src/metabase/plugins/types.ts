import { Member, User } from "metabase-types/api";
import { ConfirmationState } from "metabase/hooks/use-confirmation";

export type GetChangeMembershipConfirmation = (
  currentUser: User,
  updatedMembership: Member,
) => Partial<ConfirmationState> | null;

export type GetRemoveMembershipConfirmation = (
  currentUser: User,
  currentUserMemberships: Member[],
  deletedMembershipId: number,
) => Partial<ConfirmationState> | null;

export type GetRevokeManagerPeopleRedirect = (
  currentUser: User,
  currentUserMemberships: Member[],
) => string | null;

export type GetRevokeManagerGroupsRedirect = (
  currentUser: User,
  currentUserMemberships: Member[],
) => string | null;

export type PluginGroupManagersType = {
  UserTypeToggle: (props: any) => JSX.Element;
  UserTypeCell: ((props: any) => JSX.Element) | null;

  getChangeMembershipConfirmation: GetChangeMembershipConfirmation;
  getRemoveMembershipConfirmation: GetRemoveMembershipConfirmation;

  deleteGroup: any;
  confirmDeleteMembershipAction: any;
  confirmUpdateMembershipAction: any;
};
