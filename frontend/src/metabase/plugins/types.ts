import type { ComponentType, ReactNode } from "react";
import type { DashboardId, Member, User } from "metabase-types/api";
import type { ConfirmationState } from "metabase/hooks/use-confirmation";
import type { FormValues } from "metabase/containers/SaveQuestionModal";
import type Question from "metabase-lib/Question";

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

export type TUseLLMQuestionNameDescription = ({
  initialValues,
  question,
}: {
  initialValues: FormValues;
  question: Question;
}) => {
  generatedName: string;
  generatedDescription: string;
  loading: boolean;
  LLMLoadingIndicator: () => JSX.Element | null;
};

export type TUseLLMDashboardDescription = ({
  dashboardId,
}: {
  dashboardId: DashboardId;
}) => {
  generatedDescription: string;
  loading: boolean;
  SuggestDescriptionButton: () => JSX.Element | null;
};

export type TUseLLMIndicator = ({
  initialValues,
  question,
  defaultWrapper,
}: {
  initialValues: FormValues;
  question: Question;
  defaultWrapper: ({ children }: { children: ReactNode }) => JSX.Element | null;
}) => {
  generatedName: string;
  generatedDescription: string;
  loading: boolean;
  LLMLoadingBadge: ({
    children,
  }: {
    children: ReactNode;
  }) => JSX.Element | null;
};

export type PluginLLMAutoDescription = {
  useLLMQuestionNameDescription: TUseLLMQuestionNameDescription;
  useLLMDashboardDescription: TUseLLMDashboardDescription;
  useLLMIndicator: TUseLLMIndicator;
};
