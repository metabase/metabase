import React from "react";
import { t } from "ttag";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getIsLdapEnabled } from "../../selectors";
import { AuthButton } from "../AuthButton";

interface PasswordButtonProps {
  isLdapEnabled: boolean;
  redirectUrl?: string;
}

export const PasswordButton = ({ redirectUrl }: PasswordButtonProps) => {
  const isLdapEnabled = useSelector(getIsLdapEnabled);

  return (
    <AuthButton link={Urls.password(redirectUrl)}>
      {isLdapEnabled
        ? t`Sign in with username or email`
        : t`Sign in with email`}
    </AuthButton>
  );
};
