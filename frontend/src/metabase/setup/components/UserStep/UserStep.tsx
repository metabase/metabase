import React from "react";
import { t } from "ttag";
import { UserInfo } from "metabase-types/store";
import ActiveStep from "../ActiveStep";
import InactiveStep from "../InvactiveStep";
import UserForm from "../UserForm";
import { StepDescription } from "./UserStep.styled";

export interface UserStepProps {
  user?: UserInfo;
  isHosted: boolean;
  isStepActive: boolean;
  isStepCompleted: boolean;
  isSetupCompleted: boolean;
  onValidatePassword: (password: string) => Promise<string | undefined>;
  onStepSelect: () => void;
  onStepSubmit: (user: UserInfo) => void;
}

const UserStep = ({
  user,
  isHosted,
  isStepActive,
  isStepCompleted,
  isSetupCompleted,
  onValidatePassword,
  onStepSelect,
  onStepSubmit,
}: UserStepProps): JSX.Element => {
  if (!isStepActive) {
    return (
      <InactiveStep
        title={getStepTitle(user, isStepCompleted)}
        label={2}
        isStepCompleted={isStepCompleted}
        isSetupCompleted={isSetupCompleted}
        onStepSelect={onStepSelect}
      />
    );
  }

  return (
    <ActiveStep title={getStepTitle(user, isStepCompleted)} label={2}>
      {isHosted && (
        <StepDescription>
          {t`We know you’ve already created one of these.`}{" "}
          {t`We like to keep billing and product accounts separate so that you don’t have to share logins.`}
        </StepDescription>
      )}
      <UserForm
        user={user}
        onValidatePassword={onValidatePassword}
        onSubmit={onStepSubmit}
      />
    </ActiveStep>
  );
};

const getStepTitle = (user: UserInfo | undefined, isStepCompleted: boolean) => {
  const namePart = user?.first_name ? `, ${user.first_name}` : "";
  return isStepCompleted
    ? t`Hi${namePart}. Nice to meet you!`
    : t`What should we call you?`;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default UserStep;
