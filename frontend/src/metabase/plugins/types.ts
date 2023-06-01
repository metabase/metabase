import type { ComponentType } from "react";
import type { Member, User } from "metabase-types/api";
import type { ConfirmationState } from "metabase/hooks/use-confirmation";

export interface AuthProvider {
  name: string;
  Button: ComponentType<AuthProviderButtonProps>;
  Panel?: ComponentType<AuthProviderPanelProps>;
}

export interface AuthProviderButtonProps {
  isCard?: boolean;
  redirectUrl?: string;
}

export interface AuthProviderPanelProps {
  redirectUrl?: string;
}

export type GetAuthProviders = (providers: AuthProvider[]) => AuthProvider[];

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
