import React from "react";
import { t } from "ttag";
import ActiveStep from "../ActiveStep";
import InactiveStep from "../InvactiveStep";
import { UserInfo } from "../../types";
import UserForm from "../UserForm/UserForm";

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
  const title = isCompleted
    ? t`Hi, ${user?.first_name}. Nice to meet you!`
    : t`What should we call you?`;

  const handleSubmit = (user: UserInfo) => {
    onChangeUser(user);
    onSelectNextStep();
  };

  if (!isActive) {
    return (
      <InactiveStep
        title={title}
        label={2}
        isCompleted={isCompleted}
        onSelect={onSelectThisStep}
      />
    );
  }

  return (
    <ActiveStep title={title} label={2}>
      <UserForm
        user={user}
        onSubmit={handleSubmit}
        onValidatePassword={onValidatePassword}
      />
    </ActiveStep>
  );
};

export default UserStep;
