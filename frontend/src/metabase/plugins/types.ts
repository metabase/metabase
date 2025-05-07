import type { ComponentType } from "react";

import type { ConfirmationState } from "metabase/hooks/use-confirmation";
import type Question from "metabase-lib/v1/Question";
import type {
  CollectionId,
  Member,
  Membership,
  User,
} from "metabase-types/api";

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
  updatedMembership: Membership,
) => Pick<ConfirmationState, "title" | "message"> | null;

export type GetRemoveMembershipConfirmation = (
  currentUser: User,
  currentUserMemberships: Membership[],
  deletedMembershipId: number,
) => Pick<ConfirmationState, "title" | "message"> | null;

export type GetRevokeManagerPeopleRedirect = (
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

export type LLMIndicatorProps = {
  question: Question;
  initialCollectionId: CollectionId | null | undefined;
  onAccept: (values: { name?: string; description?: string }) => void;
};

export type LLMSuggestQuestionInfo = (
  props: LLMIndicatorProps,
) => JSX.Element | null;

export type PluginLLMAutoDescription = {
  isEnabled: () => boolean;
  LLMSuggestQuestionInfo: LLMSuggestQuestionInfo;
};
