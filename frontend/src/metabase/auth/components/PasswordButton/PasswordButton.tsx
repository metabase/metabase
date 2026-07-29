import { t } from "ttag";

import { useSelector } from "metabase/redux";
import * as Urls from "metabase/urls";

import { getIsLdapEnabled } from "../../selectors";
import { AuthTextLink } from "../AuthButton";

interface PasswordButtonProps {
  redirectUrl?: string;
}

export const PasswordButton = ({ redirectUrl }: PasswordButtonProps) => {
  const isLdapEnabled = useSelector(getIsLdapEnabled);

  return (
    <AuthTextLink to={Urls.password(redirectUrl)}>
      {isLdapEnabled
        ? t`Sign in with username or email`
        : t`Sign in with email`}
    </AuthTextLink>
  );
};
