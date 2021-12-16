import React from "react";
import { t } from "ttag";
import Users from "metabase/entities/users";
import ActiveStep from "../ActiveStep";
import InactiveStep from "../InvactiveStep";
import {
  UserFormRoot,
  UserFormGroup,
  StepDescription,
} from "./UserStep.styled";
import { FormProps } from "./types";
import { UserInfo } from "../../types";
import { getIn } from "icepick";

interface Props {
  user?: UserInfo;
  isActive: boolean;
  isFilled: boolean;
  isCompleted: boolean;
  isHosted: boolean;
  onChangeUser: (user: UserInfo) => void;
  onValidatePassword: (user: UserInfo) => void;
  onSelectThisStep: () => void;
  onSelectNextStep: () => void;
}

const UserStep = ({
  user,
  isActive,
  isFilled,
  isCompleted,
  isHosted,
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
        title={getStepTitle(user, isFilled)}
        label={2}
        isFilled={isFilled}
        isCompleted={isCompleted}
        onSelect={onSelectThisStep}
      />
    );
  }

  return (
    <ActiveStep title={getStepTitle(user, isFilled)} label={2}>
      {isHosted && (
        <StepDescription>
          {t`We know you’ve already created one of these.`}{" "}
          {t`We like to keep billing and product accounts separate so that you don’t have to share logins.`}
        </StepDescription>
      )}
      <UserForm
        user={user}
        onSubmit={handleSubmit}
        onValidatePassword={onValidatePassword}
      />
    </ActiveStep>
  );
};

interface UserFormProps {
  user?: UserInfo;
  onSubmit: (user: UserInfo) => void;
  onValidatePassword: (user: UserInfo) => void;
}

const UserForm = ({ user, onSubmit, onValidatePassword }: UserFormProps) => {
  const handleAsyncValidate = async (user: UserInfo) => {
    try {
      onValidatePassword(user);
      return {};
    } catch (error) {
      return getIn(error, ["data", "errors"]);
    }
  };

  return (
    <UserFormRoot
      form={Users.forms.setup()}
      user={user}
      asyncValidate={handleAsyncValidate}
      asyncBlurFields={["password"]}
      onSubmit={onSubmit}
    >
      {({ Form, FormField, FormFooter }: FormProps) => {
        return (
          <Form>
            <UserFormGroup>
              <FormField name="first_name" />
              <FormField name="last_name" />
            </UserFormGroup>
            <FormField name="email" />
            <FormField name="site_name" />
            <FormField name="password" />
            <FormField name="password_confirm" />
            <FormFooter submitTitle={t`Next`} />
          </Form>
        );
      }}
    </UserFormRoot>
  );
};

const getStepTitle = (user: UserInfo | undefined, isFilled: boolean) => {
  return isFilled
    ? t`Hi, ${user?.first_name}. Nice to meet you!`
    : t`What should we call you?`;
};

export default UserStep;
