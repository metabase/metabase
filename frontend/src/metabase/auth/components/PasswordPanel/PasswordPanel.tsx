import React, { useCallback } from "react";
import { t } from "ttag";
import AuthButton from "../AuthButton";
import LoginForm from "../LoginForm";
import { AuthProvider, LoginData } from "../../types";
import { ActionListItem, ActionList } from "./PasswordPanel.styled";

export interface PasswordPanelProps {
  providers?: AuthProvider[];
  redirectUrl?: string;
  isLdapEnabled: boolean;
  hasSessionCookies: boolean;
  onLogin: (data: LoginData, redirectUrl?: string) => void;
}

const PasswordPanel = ({
  providers = [],
  redirectUrl,
  isLdapEnabled,
  hasSessionCookies,
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
      <LoginForm
        isLdapEnabled={isLdapEnabled}
        hasSessionCookies={hasSessionCookies}
        onSubmit={handleSubmit}
      />
      <ActionList>
        <ActionListItem>
          <AuthButton link="/auth/forgot_password">
            {t`I seem to have forgotten my password`}
          </AuthButton>
        </ActionListItem>
        {providers.map(provider => (
          <ActionListItem key={provider.name}>
            <provider.Button redirectUrl={redirectUrl} />
          </ActionListItem>
        ))}
      </ActionList>
    </div>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default PasswordPanel;
