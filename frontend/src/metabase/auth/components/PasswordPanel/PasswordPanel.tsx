import React, { useCallback } from "react";
import { t } from "ttag";
import Users from "metabase/entities/users";
import AuthButton from "../AuthButton";
import { AuthProvider, LoginData } from "../../types";
import { ActionItem, ActionList } from "./PasswordPanel.styled";

export interface PasswordPanelProps {
  providers?: AuthProvider[];
  redirectUrl?: string;
  onLogin: (data: LoginData, redirectUrl?: string) => void;
}

const PasswordPanel = ({
  providers = [],
  redirectUrl,
  onLogin,
}: PasswordPanelProps) => {
  const handleSubmit = useCallback(
    async (data: LoginData) => {
      await onLogin(data, redirectUrl);
    },
    [onLogin, redirectUrl],
  );

  return (
    <div>
      <Users.Form
        form={Users.forms.login()}
        submitTitle={t`Sign in`}
        submitFullWidth
        onSubmit={handleSubmit}
      />
      <ActionList>
        <ActionItem>
          <AuthButton
            text={t`I seem to have forgotten my password`}
            link="/auth/forgot_password"
          />
        </ActionItem>
        {providers.map(provider => (
          <ActionItem key={provider.name}>
            <provider.Button redirectUrl={redirectUrl} />
          </ActionItem>
        ))}
      </ActionList>
    </div>
  );
};

export default PasswordPanel;
