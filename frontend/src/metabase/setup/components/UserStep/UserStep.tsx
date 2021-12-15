import React from "react";
import { t } from "ttag";
import ActiveStep from "../ActiveStep";
import InactiveStep from "../InvactiveStep";
import UserForm from "../UserForm";
import { UserInfo } from "../../types";

interface Props {
  user?: UserInfo;
  isActive: boolean;
  isCompleted: boolean;
  onChangeUser: (user: UserInfo) => void;
  onValidatePassword: (user: UserInfo) => void;
  onSelectThisStep: () => void;
  onSelectNextStep: () => void;
}

const UserStep = ({
  user,
  isActive,
  isCompleted,
  onChangeUser,
  onValidatePassword,
  onSelectThisStep,
  onSelectNextStep,
}: Props) => {
  const handleSubmit = (user: UserInfo) => {
    onChangeUser(user);
    onSelectNextStep();
  };

  if (!isActive) {
    return (
      <InactiveStep
        title={getStepTitle(user, isCompleted)}
        label={2}
        isCompleted={isCompleted}
        onSelect={onSelectThisStep}
      />
    );
  }

  return (
    <ActiveStep title={getStepTitle(user, isCompleted)} label={2}>
      <UserForm
        user={user}
        onSubmit={handleSubmit}
        onValidatePassword={onValidatePassword}
      />
    </ActiveStep>
  );
};

const getStepTitle = (user: UserInfo | undefined, isCompleted: boolean) => {
  return isCompleted
    ? t`Hi, ${user?.first_name}. Nice to meet you!`
    : t`What should we call you?`;
};

export default UserStep;
