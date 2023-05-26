import React from "react";
import { t } from "ttag";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { AuthButton } from "../AuthButton";

interface PasswordButtonProps {
  isLdapEnabled: boolean;
  redirectUrl?: string;
}

export const PasswordButton = ({ redirectUrl }: PasswordButtonProps) => {
  const hasLdap = useSelector(state => getSetting(state, "ldap-enabled"));
  const link = redirectUrl
    ? `/auth/login/password?redirect=${encodeURIComponent(redirectUrl)}`
    : `/auth/login/password`;

  return (
    <AuthButton link={link}>
      {hasLdap ? t`Sign in with username or email` : t`Sign in with email`}
    </AuthButton>
  );
};
