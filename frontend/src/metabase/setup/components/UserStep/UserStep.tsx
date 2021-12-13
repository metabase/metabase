import React from "react";
import { t } from "ttag";
import InactiveStep from "../InvactiveStep";
import { UserInfo } from "../../types";

interface Props {
  user?: UserInfo;
  isActive?: boolean;
  isCompleted?: boolean;
  onSelectThisStep?: () => void;
  onSelectNextStep?: () => void;
}

const UserStep = ({
  user,
  isActive,
  isCompleted,
  onSelectThisStep,
  onSelectNextStep,
}: Props) => {
  if (!isActive) {
    return (
      <InactiveStep
        title={
          isCompleted
            ? t`Hi, ${user?.first_name}. Nice to meet you!`
            : t`What should we call you?`
        }
        label={2}
        isCompleted={isCompleted}
        onSelect={onSelectThisStep}
      />
    );
  }

  return null;
};

export default UserStep;
