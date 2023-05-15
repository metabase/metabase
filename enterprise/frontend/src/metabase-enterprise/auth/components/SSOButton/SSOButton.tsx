import React, { useCallback, useEffect } from "react";
import { t } from "ttag";
import AuthButton from "metabase/auth/components/AuthButton";

export interface SSOButtonProps {
  isCard?: boolean;
  isEmbedded?: boolean;
  redirectUrl?: string;
  onLogin: (redirectUrl?: string) => void;
}

const SSOButton = ({
  isCard,
  isEmbedded,
  redirectUrl,
  onLogin,
}: SSOButtonProps): JSX.Element => {
  const handleLogin = useCallback(() => {
    onLogin(redirectUrl);
  }, [onLogin, redirectUrl]);

  useEffect(() => {
    isEmbedded && handleLogin();
  }, [isEmbedded, handleLogin]);

  return (
    <AuthButton isCard={isCard} onClick={handleLogin}>
      {t`Sign in with SSO`}
    </AuthButton>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SSOButton;
