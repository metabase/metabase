import React from "react";
import { t } from "ttag";
import { getIn } from "icepick";
import Users from "metabase/entities/users";
import { UserInfo } from "metabase-types/store";
import ActiveStep from "../ActiveStep";
import InactiveStep from "../InvactiveStep";
import {
  UserFormRoot,
  UserFormGroup,
  StepDescription,
} from "./UserStep.styled";
import { FormProps } from "./types";

export interface UserStepProps {
  user?: UserInfo;
  isHosted: boolean;
  isStepActive: boolean;
  isStepCompleted: boolean;
  isSetupCompleted: boolean;
  onPasswordChange: (user: UserInfo) => void;
  onStepSelect: () => void;
  onStepSubmit: (user: UserInfo) => void;
}

const UserStep = ({
  user,
  isHosted,
  isStepActive,
  isStepCompleted,
  isSetupCompleted,
  onPasswordChange,
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
        onSubmit={onStepSubmit}
        onPasswordChange={onPasswordChange}
      />
    </ActiveStep>
  );
};

interface UserFormProps {
  user?: UserInfo;
  onSubmit: (user: UserInfo) => void;
  onPasswordChange: (user: UserInfo) => void;
}

const UserForm = ({ user, onSubmit, onPasswordChange }: UserFormProps) => {
  const handleAsyncValidate = async (user: UserInfo) => {
    try {
      await onPasswordChange(user);
      return {};
    } catch (error) {
      return getSubmitError(error);
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
      {({ Form, FormField, FormFooter }: FormProps) => (
        <Form>
          <UserFormGroup>
            {/* XXX: There's nothing to do here. We just need to modify `entities/users/form.js` and we'll be all good. */}
            {/* https://user-images.githubusercontent.com/1937582/172606484-6a1a2ae2-9657-4cb3-b96d-bc71a8eb30ee.png */}
            <FormField name="first_name" />
            <FormField name="last_name" />
          </UserFormGroup>
          <FormField name="email" />
          <FormField name="site_name" />
          <FormField name="password" />
          <FormField name="password_confirm" />
          <FormFooter submitTitle={t`Next`} />
        </Form>
      )}
    </UserFormRoot>
  );
};

const getStepTitle = (user: UserInfo | undefined, isStepCompleted: boolean) => {
  return isStepCompleted
    ? // XXX: This might be the second place that we don't to fallback to an email.
      // https://user-images.githubusercontent.com/1937582/172606914-8f4995da-6a7b-48b6-8481-536e2aca69c7.png
      t`Hi, ${user?.first_name}. Nice to meet you!`
    : t`What should we call you?`;
};

const getSubmitError = (error: unknown) => {
  return getIn(error, ["data", "errors"]);
};

export default UserStep;
