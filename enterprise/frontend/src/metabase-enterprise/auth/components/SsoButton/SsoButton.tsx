import React, { useCallback, useEffect } from "react";
import { t } from "ttag";
import { isWithinIframe } from "metabase/lib/dom";
import { useDispatch } from "metabase/lib/redux";
import { AuthButton } from "metabase/auth/components/AuthButton";
import { loginSSO } from "../../actions";

interface SsoButtonProps {
  isCard?: boolean;
  redirectUrl?: string;
}

export const SsoButton = ({
  isCard,
  redirectUrl,
}: SsoButtonProps): JSX.Element => {
  const isEmbedded = isWithinIframe();
  const dispatch = useDispatch();

  const handleLogin = useCallback(() => {
    dispatch(loginSSO(redirectUrl));
  }, [dispatch, redirectUrl]);

  useEffect(() => {
    if (isEmbedded) {
      handleLogin();
    }
  }, [isEmbedded, handleLogin]);

  return (
    <AuthButton isCard={isCard} onClick={handleLogin}>
      {t`Sign in with SSO`}
    </AuthButton>
  );
};
