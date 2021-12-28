import React, { useCallback } from "react";
import { t } from "ttag";
import Users from "metabase/entities/users";
import { LoginData } from "../../types";

export interface PasswordPanelProps {
  redirectUrl?: string;
  onLogin: (data: LoginData, redirectUrl?: string) => void;
}

const PasswordPanel = ({ redirectUrl, onLogin }: PasswordPanelProps) => {
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
    </div>
  );
};

export default PasswordPanel;
