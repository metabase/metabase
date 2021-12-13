import React, { ComponentType } from "react";
import { t } from "ttag";
import User from "metabase/entities/users";
import ActiveStep from "../ActiveStep";
import InactiveStep from "../InvactiveStep";
import { UserInfo } from "../../types";
import { UserForm, FieldGroup } from "./UserStep.styled";

interface Props {
  user?: UserInfo;
  isActive?: boolean;
  isCompleted?: boolean;
  onChangeUser?: (user: UserInfo) => void;
  onValidatePassword?: (user: UserInfo) => void;
  onSelectThisStep?: () => void;
  onSelectNextStep?: () => void;
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
  const title = getStepTitle(user, isCompleted);

  const handleSubmit = (user: UserInfo) => {
    onChangeUser?.(user);
    onSelectNextStep?.();
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
        form={User.forms.setup()}
        user={user}
        asyncValidate={onValidatePassword}
        asyncBlurFields={["password"]}
        onSubmit={handleSubmit}
      >
        {({ Form, FormField, FormFooter }: FormOpts) => {
          return (
            <Form>
              <FieldGroup>
                <FormField name="first_name" />
                <FormField name="last_name" />
              </FieldGroup>
              <FormField name="email" />
              <FormField name="site_name" />
              <FormField name="password" />
              <FormField name="password_confirm" />
              <FormFooter submitTitle={t`Next`} />
            </Form>
          );
        }}
      </UserForm>
    </ActiveStep>
  );
};

const getStepTitle = (user?: UserInfo, isCompleted?: boolean) => {
  return isCompleted
    ? t`Hi, ${user?.first_name}. Nice to meet you!`
    : t`What should we call you?`;
};

interface FormOpts {
  Form: ComponentType;
  FormField: ComponentType<{ name: string }>;
  FormFooter: ComponentType<{ submitTitle?: string }>;
}

export default UserStep;
