import { t } from "ttag";

import { useSetting } from "metabase/settings";
import * as Urls from "metabase/urls";

import { AuthTextLink } from "../AuthButton";

interface PasswordButtonProps {
  redirectUrl?: string;
}

export const PasswordButton = ({ redirectUrl }: PasswordButtonProps) => {
  const isLdapEnabled = useSetting("ldap-enabled");

  return (
    <AuthTextLink to={Urls.password(redirectUrl)}>
      {isLdapEnabled
        ? t`Sign in with username or email`
        : t`Sign in with email`}
    </AuthTextLink>
  );
};
