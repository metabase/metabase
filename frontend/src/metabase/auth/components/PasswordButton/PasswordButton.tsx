import React from "react";
import { t } from "ttag";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getSetting } from "metabase/selectors/settings";
import { AuthButton } from "../AuthButton";

interface PasswordButtonProps {
  isLdapEnabled: boolean;
  redirectUrl?: string;
}

export const PasswordButton = ({ redirectUrl }: PasswordButtonProps) => {
  const isLdapEnabled = useSelector(state => getSetting(state, "ldap-enabled"));

  return (
    <AuthButton link={Urls.password(redirectUrl)}>
      {isLdapEnabled
        ? t`Sign in with username or email`
        : t`Sign in with email`}
    </AuthButton>
  );
};
