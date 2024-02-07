import { t } from "ttag";
import { useDispatch, useSelector } from "metabase/lib/redux";
import type { UserInfo } from "metabase-types/store";
import { ActiveStep } from "../ActiveStep";
import { InactiveStep } from "../InactiveStep";
import { UserForm } from "../UserForm";
import { selectStep, submitUser } from "../../actions";
import {
  getIsHosted,
  getIsSetupCompleted,
  getIsStepActive,
  getIsStepCompleted,
  getUser,
} from "../../selectors";
import { validatePassword } from "../../utils";
import type { NumberedStepProps } from "../types";
import { StepDescription } from "./UserStep.styled";

export const UserStep = ({ stepLabel }: NumberedStepProps): JSX.Element => {
  const user = useSelector(getUser);
  const isHosted = useSelector(getIsHosted);
  const isStepActive = useSelector(state =>
    getIsStepActive(state, "user_info"),
  );
  const isStepCompleted = useSelector(state =>
    getIsStepCompleted(state, "user_info"),
  );
  const isSetupCompleted = useSelector(getIsSetupCompleted);
  const dispatch = useDispatch();

  const handleStepSelect = () => {
    dispatch(selectStep("user_info"));
  };

  const handleSubmit = (user: UserInfo) => {
    dispatch(submitUser(user));
  };

  if (!isStepActive) {
    return (
      <InactiveStep
        title={getStepTitle(user, isStepCompleted)}
        label={stepLabel}
        isStepCompleted={isStepCompleted}
        isSetupCompleted={isSetupCompleted}
        onStepSelect={handleStepSelect}
      />
    );
  }

  return (
    <ActiveStep title={getStepTitle(user, isStepCompleted)} label={stepLabel}>
      {isHosted && (
        <StepDescription>
          {t`We know you’ve already created one of these.`}{" "}
          {t`We like to keep billing and product accounts separate so that you don’t have to share logins.`}
        </StepDescription>
      )}
      <UserForm
        user={user}
        onValidatePassword={validatePassword}
        onSubmit={handleSubmit}
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
